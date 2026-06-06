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
import { saveGame } from "../../game/gameStore";
import { SPECIAL_POSITIONS } from "@/game/types";
import { runBotIfNeeded } from "@/game/botRunner";
import { rollDice as rollDiceUtil } from "@/utils/dice";

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

    for (const moveItem of payload) {
      const { from, to, die, isUndo } = moveItem;
      if (isUndo) {
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
        const undonePayload = await undoLastMove(gameId, playerId);
        if (!undonePayload) {
          console.log(`[MOVE] Undo failed: no move to undo`);
          return ctx.send({
            type: "game.error",
            payload: onErrorSocketResponse("No move to undo"),
          });
        }
        const stateAfterUndo = await loadGameState(gameId);
        if (!stateAfterUndo)
          throw new Error("Failed to rebuild state after undo");
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
      } else {
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

    // Auto-pass and auto-dice block has been removed
    // Now the player must explicitly call game.endTurn to pass the turn.

    const subStatus = calculateSubStatus(finalGame);
    const legalMoves = generateMoveSequences(
      finalGame,
      finalGame.turn ?? playerId,
    );
    const flatLegalMoves = flattenMoveSequences(legalMoves);

    // ========== ساخت stateToSend با حذف کامل turnRoll ==========
    const stateToSend = { ...finalGame, legalMoves: flatLegalMoves };
    // فقط در صورتی که تاس وجود دارد، subStatus را ارسال کن

    if (finalGame.dice && finalGame.dice.length > 0) {
      stateToSend.subStatus = subStatus;
    }
    // در غیر این صورت (dice خالی) هیچ subStatusی اضافه نمی‌شود

    // ==========================================================

    rooms.broadcast(gameId, {
      type: "game.state",
      payload: onOkSocketResponse(stateToSend),
    });

    if (broadcastMoves.length) {
      const payloadToSend =
        broadcastMoves.length === 1 ? broadcastMoves[0] : broadcastMoves;
      rooms.broadcast(gameId, {
        type: "player.move",
        payload: onOkSocketResponse(payloadToSend),
      });
    }

    const afterMoveState = await loadGameState(gameId);
    if (afterMoveState && afterMoveState.status === "in-progress") {
      await runBotIfNeeded(gameId, afterMoveState.turn!, rooms);
    }
  });
}
