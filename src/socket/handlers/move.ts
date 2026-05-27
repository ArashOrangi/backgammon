import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import { validateMove } from "../../game/ruleValidator";
import {
  flattenMoveSequences,
  generateMoveSequences,
} from "../../game/moveGenerator";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import {
  appendGameEvent,
  loadGameState,
  calculateSubStatus,
  undoLastMove,
} from "@/game/eventStore";
import { GameQueue } from "@/game/gameQueue";
import { isGameOver, calculateWinType } from "../../game/engine";
import { saveGame, getGame } from "../../game/gameStore";
import { SPECIAL_POSITIONS } from "@/game/types";

// نوع حرکت ورودی مطابق سناریو (آرایه‌ای از اشیاء)
type MoveItem = {
  gameId: number;
  from: number;
  to: number;
  die: number;
  isUndo?: boolean;
};
type MovePayloadArray = MoveItem[];

const gameQueue = new GameQueue();

export async function handleMove(
  ctx: SocketContext,
  payload: MovePayloadArray,
  rooms: RoomManager,
) {
  const playerId = ctx.userId;

  if (!playerId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not authenticated"),
    });
  }

  if (!payload || !payload.length) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Empty moves array"),
    });
  }

  const gameId = payload[0].gameId;
  // بررسی یکسان بودن gameId در همه اعضا
  for (const move of payload) {
    if (move.gameId !== gameId) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Mismatched gameId in moves array"),
      });
    }
  }

  await gameQueue.enqueue(gameId, async () => {
    let finalGame = getGame(gameId);
    if (!finalGame) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Game not found"),
      });
    }

    // لیست حرکاتی که برای برادکست `player.move` جمع‌آوری می‌شوند
    const broadcastMoves: Array<{
      playerId: number;
      from: number;
      to: number;
      die: number;
      ownerId: number;
      isUndo?: boolean;
    }> = [];

    // پردازش هر حرکت به ترتیب
    for (const moveItem of payload) {
      const { from, to, die, isUndo } = moveItem;

      if (isUndo) {
        const currentSubStatus = calculateSubStatus(finalGame);
        if (finalGame.turn !== playerId || currentSubStatus === "mustEndTurn") {
          return ctx.send({
            type: "game.error",
            payload: onErrorSocketResponse("Cannot undo after ending turn"),
          });
        }
        // پس از برگشت، وضعیت جدید را لود می‌کنیم
        const stateAfterUndo = await loadGameState(gameId);
        if (!stateAfterUndo)
          throw new Error("Failed to rebuild state after undo");
        finalGame = stateAfterUndo;
        saveGame(finalGame);

        // اضافه کردن حرکت برگشت به لیست برادکست (طبق سناریو ownerId همان بازیکن است)
        broadcastMoves.push({
          playerId,
          from,
          to,
          die,
          ownerId: playerId,
          isUndo: true,
        });
      } else {
        // ---- حرکت معمولی ----
        if (finalGame.turn !== playerId) {
          return ctx.send({
            type: "game.error",
            payload: onErrorSocketResponse("It's not your turn"),
          });
        }

        const validation = validateMove(finalGame, playerId, from, to, [die]);
        if (!validation.isValid) {
          return ctx.send({
            type: "game.error",
            payload: onErrorSocketResponse(
              validation.message ?? "Invalid move",
            ),
          });
        }

        // ثبت ایونت حرکت
        await appendGameEvent(gameId, {
          type: "MOVE_APPLIED",
          payload: { playerId, from, to, die },
        });

        // بارگذاری مجدد وضعیت پس از اعمال حرکت
        const updatedGame = await loadGameState(gameId);
        if (!updatedGame) throw new Error("Failed to rebuild state after move");
        finalGame = updatedGame;
        saveGame(finalGame);

        // حرکت اصلی
        broadcastMoves.push({
          playerId,
          from,
          to,
          die,
          ownerId: playerId,
          isUndo: false,
        });

        // اگر حرکت باعث ضربه (hit) شده، یک حرکت مجازی برای انتقال مهره حریف به BAR اضافه می‌کنیم
        if (validation.isHit) {
          // تشخیص ownerId حریف (از نقطه مقصد قبل از حرکت)
          const opponentId = finalGame.players.find(
            (p) => p.id !== playerId,
          )?.id;
          if (opponentId) {
            broadcastMoves.push({
              playerId: opponentId, // صاحب مهره‌ای که زده می‌شود
              from: to,
              to: SPECIAL_POSITIONS.BAR,
              die: 0,
              ownerId: opponentId,
              isUndo: false,
            });
          }
        }

        // بررسی پایان بازی بعد از حرکت
        if (isGameOver(finalGame)) {
          const winType = calculateWinType(finalGame, playerId);
          await appendGameEvent(gameId, {
            type: "GAME_FINISHED",
            payload: { winner: playerId, winType, reason: "REGULAR" },
          });
          finalGame = (await loadGameState(gameId)) || finalGame;
          saveGame(finalGame);

          // برادکست نتیجه و وضعیت نهایی
          rooms.broadcast(gameId, {
            type: "game.result",
            payload: { winner: playerId, winType, reason: "REGULAR" },
          });
          const finalStateWithMeta = {
            ...finalGame,
            subStatus: calculateSubStatus(finalGame),
            legalMoves: [], // بعد از اتمام بازی حرکتی وجود ندارد
          };
          rooms.broadcast(gameId, {
            type: "game.state",
            payload: onOkSocketResponse(
              finalStateWithMeta,
              `Game finished: ${winType}`,
            ),
          });
          return;
        }
      }
    }

    // پس از اعمال همه حرکات (و در صورت عدم پایان بازی)، وضعیت نهایی را برادکست می‌کنیم
    const subStatus = calculateSubStatus(finalGame);
    const legalMoves = generateMoveSequences(
      finalGame,
      finalGame.turn ?? playerId,
    );
    const flatLegalMoves = flattenMoveSequences(legalMoves);
    const stateToSend = {
      ...finalGame,
      subStatus,
      legalMoves: flatLegalMoves, // طبق سناریو، legalMoves داخل game.state قرار می‌گیرد
    };
    rooms.broadcast(gameId, {
      type: "game.state",
      payload: onOkSocketResponse(stateToSend),
    });

    // ارسال لیست حرکات انجام‌شده (player.move) طبق سناریو (آرایه بدون wrapper اضافی)
    if (broadcastMoves.length) {
      const payloadToSend =
        broadcastMoves.length === 1 ? broadcastMoves[0] : broadcastMoves;
      rooms.broadcast(gameId, {
        type: "player.move",
        payload: payloadToSend,
      });
    }
  });
}
