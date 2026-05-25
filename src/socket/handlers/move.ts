import { getGame, saveGame } from "../../game/gameStore";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import { validateMove } from "../../game/ruleValidator";
import { generateMoveSequences } from "../../game/moveGenerator";
import { MovePayload } from "../../validations/game.move";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import { appendGameEvent, loadGameState } from "@/game/eventStore";
import { GameQueue } from "@/game/gameQueue";
import { isGameOver, calculateWinType } from "../../game/engine";

const gameQueue = new GameQueue();

export async function handleMove(
  ctx: SocketContext,
  payload: MovePayload,
  rooms: RoomManager,
) {
  const { gameId, from, to } = payload;
  const playerId = ctx.id;

  await gameQueue.enqueue(gameId, async () => {
    const game = getGame(gameId);

    if (!game) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Game not found"),
      });
    }

    if (game.turn !== playerId) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("It's not your turn"),
      });
    }

    if (!game.dice || game.dice.length === 0) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Dice not rolled"),
      });
    }

    const { valid, reason } = validateMove(game, playerId, from, to);
    if (!valid) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse(reason ?? "Invalid move"),
      });
    }

    try {
      // ۱. ثبت حرکت در دیتابیس (Event Sourcing)
      await appendGameEvent(Number(game.id), {
        type: "MOVE_APPLIED",
        payload: { playerId, from, to },
      });

      // ۲. بازسازی استیت از روی تاریخچه وقایع
      let updatedGame = await loadGameState(Number(game.id));
      if (!updatedGame) throw new Error("Failed to rebuild state");

      // ۳. اعلام حرکت به همه (برای انیمیشن کلاینت)
      rooms.broadcast(gameId, {
        type: "player.move",
        payload: { playerId, from, to },
      });

      /* ------------------------------------------------------------------ */
      /* ۴. چک کردن شرط برد با متدهای تخصصی (Core Logic)                       */
      /* ------------------------------------------------------------------ */
      if (isGameOver(updatedGame)) {
        // تشخیص دقیق نوع برد: Normal, Mars, Backgammon
        const winType = calculateWinType(updatedGame, playerId);

        await appendGameEvent(Number(updatedGame.id), {
          type: "GAME_FINISHED",
          payload: {
            winner: playerId,
            winType, // حالا دیگه مقدار دقیق ذخیره می‌شه
            reason: "REGULAR",
          },
        });

        // لود مجدد برای گرفتن استیت نهایی با وضعیت status: finished
        updatedGame =
          (await loadGameState(Number(updatedGame.id))) || updatedGame;
        saveGame(updatedGame);

        // اعلام پایان بازی به کلاینت‌ها با جزئیات کامل
        rooms.broadcast(updatedGame.id, {
          type: "game.result",
          payload: {
            winner: playerId,
            winType,
            reason: "REGULAR_WIN",
          },
        });

        rooms.broadcast(updatedGame.id, {
          type: "game.state",
          payload: onOkSocketResponse(updatedGame, `Game finished: ${winType}`),
        });

        return; // خروج از صف چون بازی تمام شده
      }

      /* ------------------------------------------------------------------ */
      /* ۵. منطق تغییر نوبت                                                  */
      /* ------------------------------------------------------------------ */
      const legalMoves = generateMoveSequences(updatedGame, playerId);

      if (legalMoves.length === 0) {
        await appendGameEvent(Number(updatedGame.id), {
          type: "TURN_PASSED",
          payload: { playerId, reason: "NO_LEGAL_MOVES" },
        });

        updatedGame =
          (await loadGameState(Number(updatedGame.id))) || updatedGame;
        saveGame(updatedGame);

        // اعلام تغییر نوبت به کلاینت‌ها
        const nextPlayer = updatedGame.players.find(
          (p) => p.id === updatedGame?.turn,
        );
        if (nextPlayer) {
          rooms.broadcast(updatedGame.id, {
            type: "game.turn",
            payload: {
              playerId: nextPlayer.id,
              color: nextPlayer.color,
            },
          });
        }
      }

      // ۶. ذخیره و ارسال استیت لحظه‌ای
      saveGame(updatedGame);
      rooms.broadcast(updatedGame.id, {
        type: "game.state",
        payload: onOkSocketResponse(updatedGame),
      });

      // ارسال حرکات قانونی باقی‌مانده
      if (legalMoves.length > 0) {
        rooms.broadcast(updatedGame.id, {
          type: "game.legalMoves",
          payload: onOkSocketResponse(legalMoves),
        });
      }
    } catch (err) {
      console.error("Move Error:", err);
      ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse(
          err instanceof Error ? err.message : "Move failed",
        ),
      });
    }
  });
}
