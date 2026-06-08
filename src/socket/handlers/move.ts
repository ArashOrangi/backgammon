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
  forceSnapshot, // اضافه شد
} from "@/game/eventStore";
import { GameQueue } from "@/game/gameQueue";
import { isGameOver, calculateWinType } from "../../game/engine";
import { saveGame } from "../../game/gameStore";
import { SPECIAL_POSITIONS } from "@/game/types";
import { runBotIfNeeded } from "@/game/botRunner";

type MoveItem = {
  gameId: number;
  from: number;
  to: number;
  die: number;
  isUndo?: boolean;
};
type MovePayloadArray = MoveItem[];

const gameQueue = new GameQueue();

// ذخیره اطلاعات hit اخیر برای هر بازی (موقتی در حافظه)
const lastHitInfo = new Map<
  number,
  { opponentId: number; fromPoint: number }
>();

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
  for (const move of payload) {
    if (move.gameId !== gameId) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Mismatched gameId in moves array"),
      });
    }
  }

  await gameQueue.enqueue(gameId, async () => {
    let finalGame = await loadGameState(gameId);
    if (!finalGame) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Game not found"),
      });
    }

    const broadcastMoves: Array<{
      playerId: number;
      from: number;
      to: number;
      die: number;
      ownerId: number;
      isUndo?: boolean;
    }> = [];

    let undoProcessed = false; // جلوگیری از پردازش چندباره undo

    for (const moveItem of payload) {
      const { from, to, die, isUndo } = moveItem;
      if (isUndo) {
        // نادیده گرفتن حرکات مجازی ضربه (مقصد BAR)
        if (to === SPECIAL_POSITIONS.BAR) {
          console.log(`[MOVE] Ignoring undo for hit move (to BAR)`);
          continue;
        }
        if (undoProcessed) {
          console.log(`[MOVE] Duplicate undo request ignored`);
          continue;
        }
        undoProcessed = true;

        console.log(
          `[MOVE] Undo requested for game ${gameId}, player ${playerId}`,
        );
        if (finalGame.turn !== playerId) {
          console.log(`[MOVE] Undo rejected: not your turn`);
          return ctx.send({
            type: "game.error",
            payload: onErrorSocketResponse("It's not your turn to undo"),
          });
        }

        // دریافت اطلاعات hit مربوط به آخرین حرکت این بازیکن (اگر وجود داشته باشد)
        const hitInfo = lastHitInfo.get(gameId);

        const undonePayload = await undoLastMove(gameId, playerId);
        if (!undonePayload) {
          console.log(`[MOVE] Undo failed: no move to undo`);
          return ctx.send({
            type: "game.error",
            payload: onErrorSocketResponse("No move to undo"),
          });
        }

        let stateAfterUndo = await loadGameState(gameId);
        if (!stateAfterUndo)
          throw new Error("Failed to rebuild state after undo");

        // اگر hit وجود داشت، اثر آن را به صورت دستی برگردانیم
        if (hitInfo) {
          const { opponentId, fromPoint } = hitInfo;
          // مهره حریف را از بار خارج کن
          if (stateAfterUndo.board.bar[opponentId] > 0) {
            stateAfterUndo.board.bar[opponentId]--;
            // برگرداندن مهره به نقطه قبلی
            const targetPoint = stateAfterUndo.board.points[fromPoint];
            if (targetPoint.owner === null) {
              targetPoint.owner = opponentId;
              targetPoint.count = 1;
            } else if (targetPoint.owner === opponentId) {
              targetPoint.count++;
            } else {
              console.warn(
                `Point ${fromPoint} is blocked, cannot restore hit checker`,
              );
            }
            // ذخیره تغییرات دستی در snapshot
            await forceSnapshot(gameId, stateAfterUndo);
          }
          // پاک کردن اطلاعات hit برای این بازی (فقط یک بار استفاده شود)
          lastHitInfo.delete(gameId);
        }

        finalGame = stateAfterUndo;
        saveGame(finalGame);

        broadcastMoves.push({
          playerId,
          from,
          to,
          die,
          ownerId: playerId,
          isUndo: true,
        });

        // بعد از undo، حلقه را می‌شکنیم تا حرکت دیگری پردازش نشود
        break;
      } else {
        // حرکت عادی (غیر undo)
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
        await appendGameEvent(gameId, {
          type: "MOVE_APPLIED",
          payload: { playerId, from, to, die },
        });
        const updatedGame = await loadGameState(gameId);
        if (!updatedGame) throw new Error("Failed to rebuild state after move");
        finalGame = updatedGame;
        saveGame(finalGame);
        broadcastMoves.push({
          playerId,
          from,
          to,
          die,
          ownerId: playerId,
          isUndo: false,
        });
        if (validation.isHit) {
          const opponentId = finalGame.players.find(
            (p) => p.id !== playerId,
          )?.id;
          if (opponentId) {
            // ذخیره اطلاعات hit در حافظه برای استفاده در undo بعدی
            lastHitInfo.set(gameId, { opponentId, fromPoint: to });
            broadcastMoves.push({
              playerId: opponentId,
              from: to,
              to: SPECIAL_POSITIONS.BAR,
              die: 0,
              ownerId: opponentId,
              isUndo: false,
            });
          }
        }
        if (isGameOver(finalGame)) {
          const winType = calculateWinType(finalGame, playerId);
          await appendGameEvent(gameId, {
            type: "GAME_FINISHED",
            payload: { winner: playerId, winType, reason: "REGULAR" },
          });
          const finishedGame = await loadGameState(gameId);
          if (finishedGame) {
            finalGame = finishedGame;
            saveGame(finalGame);
          }
          rooms.broadcast(gameId, {
            type: "game.result",
            payload: onOkSocketResponse({
              winner: playerId,
              winType,
              reason: "REGULAR",
            }),
          });
          const finalStateWithMeta = {
            ...finalGame,
            subStatus: calculateSubStatus(finalGame),
            legalMoves: [],
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

    const subStatus = calculateSubStatus(finalGame);
    const legalMoves = generateMoveSequences(
      finalGame,
      finalGame.turn ?? playerId,
    );
    const flatLegalMoves = flattenMoveSequences(legalMoves);

    const stateToSend = { ...finalGame, legalMoves: flatLegalMoves };
    if (finalGame.dice && finalGame.dice.length > 0) {
      stateToSend.subStatus =
        flatLegalMoves.length > 0 ? "playDice" : "mustEndTurn";
    }

    rooms.broadcast(gameId, {
      type: "game.state",
      payload: onOkSocketResponse(stateToSend),
    });

    if (broadcastMoves.length) {
      rooms.broadcast(gameId, {
        type: "player.move",
        payload: onOkSocketResponse(broadcastMoves),
      });
    }

    const afterMoveState = await loadGameState(gameId);
    if (afterMoveState && afterMoveState.status === "in-progress") {
      await runBotIfNeeded(gameId, afterMoveState.turn!, rooms);
    }
  });
}
