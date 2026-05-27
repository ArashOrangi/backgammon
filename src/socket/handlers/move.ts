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
import { calculateSubStatus } from "@/game/eventStore"; // اضافه شد

const gameQueue = new GameQueue();

export async function handleMove(
  ctx: SocketContext,
  payload: MovePayload & { die: number }, // اضافه شدن die به ورودی
  rooms: RoomManager,
) {
  const { gameId, from, to, die } = payload; // استخراج die
  const playerId = ctx.userId;

  if (!playerId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not authenticated"),
    });
  }

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

    // بررسی وجود تاس در استیت فعلی قبل از هر چیز
    if (!game.dice || !game.dice.includes(die)) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse(`Invalid die: ${die}`),
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
      // ۱. ثبت حرکت با تاس مصرف شده در EventStore
      await appendGameEvent(game.id, {
        type: "MOVE_APPLIED",
        payload: { playerId, from, to, die }, // die اینجا ذخیره می‌شود
      });

      // ۲. بازسازی استیت (applyMove داخلی، خودش consumeDie را بر اساس die ارسالی انجام می‌دهد)
      let updatedGame = await loadGameState(game.id);
      if (!updatedGame) throw new Error("Failed to rebuild state");

      // ۳. اعلام حرکت به همه (طبق سناریو: add dice value here too)
      rooms.broadcast(gameId, {
        type: "player.move",
        payload: { playerId, from, to, die }, // ارسال die برای کلاینت
      });

      /* ------------------------------------------------------------------ */
      /* ۴. چک کردن شرط برد                                                  */
      /* ------------------------------------------------------------------ */
      if (isGameOver(updatedGame)) {
        const winType = calculateWinType(updatedGame, playerId);

        await appendGameEvent(updatedGame.id, {
          type: "GAME_FINISHED",
          payload: {
            winner: playerId,
            winType,
            reason: "REGULAR",
          },
        });

        updatedGame = (await loadGameState(updatedGame.id)) || updatedGame;
        saveGame(updatedGame);

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

        return;
      }

      /* ------------------------------------------------------------------ */
      /* 5. منطق تزریق subStatus و ارسال استیت                                */
      /* ------------------------------------------------------------------ */

      // محاسبه وضعیت زیرمجموعه بر اساس حرکات باقی‌مانده قانونی
      const legalMoves = generateMoveSequences(updatedGame, playerId);

      // استفاده از تابع متمرکز calculateSubStatus برای هماهنگی کامل
      (updatedGame as any).subStatus = calculateSubStatus(updatedGame);

      // ذخیره و ارسال استیت نهایی شده به اتاق
      saveGame(updatedGame);
      rooms.broadcast(updatedGame.id, {
        type: "game.state",
        payload: onOkSocketResponse(updatedGame),
      });

      // ارسال لیست حرکات قانونی برای آپدیت هایلایت‌های فرانت‌اندر
      rooms.broadcast(updatedGame.id, {
        type: "game.legalMoves",
        payload: onOkSocketResponse(legalMoves),
      });
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
