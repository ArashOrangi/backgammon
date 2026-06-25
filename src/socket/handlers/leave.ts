import { getGame, saveGame } from "../../game/gameStore";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import {
  appendGameEvent,
  loadGameState,
  calculateSubStatus,
} from "@/game/eventStore";
import {
  flattenMoveSequences,
  generateMoveSequences,
} from "@/game/moveGenerator";
import { GameQueue } from "@/game/gameQueue";
import { clearWaitingUser } from "./join";
import { GameState } from "@/game/types";

const gameQueue = new GameQueue();

type LeavePayload = { gameId: number };

export async function handleLeave(
  ctx: SocketContext,
  payload: LeavePayload,
  rooms: RoomManager,
) {
  const { gameId } = payload;
  const playerId = ctx.userId;

  if (!playerId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not authenticated"),
    });
  }

  // ✅ حالت مچ‌میکینگ (gameId = -1)
  if (gameId === -1) {
    clearWaitingUser(playerId);
    const waitingGameState: GameState = {
      id: -1,
      players: [{ id: playerId, color: "white" }],
      turn: null,
      status: "waiting",
      startingDice: {},
      board: {
        points: Array(24).fill({ owner: null, count: 0 }),
        bar: {},
        borneOff: {},
      },
      pipCount: {},
      cubeValue: 1,
      createdAt: Date.now(),
      lastActionAt: Date.now(),
      primaryTimePerTurn: 400,
      secondaryTimeBank: {},
      secondaryTimeTotal: {},
      rolledThisTurn: false,
    };
    return ctx.send({
      type: "game.state",
      payload: onOkSocketResponse(waitingGameState, "Left matchmaking queue"),
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

    const player = game.players.find((p) => p.id === playerId);
    if (!player) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Player not in game"),
      });
    }

    try {
      // سناریو ۱: بازی شروع نشده (waiting یا ready)
      if (game.status === "waiting" || game.status === "ready") {
        await appendGameEvent(game.id, {
          type: "PLAYER_LEFT",
          payload: { playerId },
        });

        const updatedGame = await loadGameState(game.id);
        if (updatedGame) {
          saveGame(updatedGame);
          rooms.leave(ctx);

          // محاسبه subStatus و legalMoves برای وضعیت جدید
          const subStatus = calculateSubStatus(updatedGame);
          let legalMoves: any[] = [];
          if (updatedGame.turn !== null) {
            legalMoves = generateMoveSequences(updatedGame, updatedGame.turn);
          }
          const flatLegalMoves = flattenMoveSequences(legalMoves);
          const stateToSend = {
            ...updatedGame,
            subStatus,
            legalMoves: flatLegalMoves,
          };

          rooms.broadcast(gameId, {
            type: "game.state",
            payload: onOkSocketResponse(stateToSend, "Player left"),
          });
        }
        return;
      }

      // سناریو ۲: بازی در جریان است (starting یا in-progress)
      rooms.leave(ctx);

      rooms.broadcast(gameId, {
        type: "network.timeout",
        payload: onOkSocketResponse({
          playerId,
          timeoutAt: Date.now() + 60000,
        }),
      });
    } catch (err) {
      console.error("Leave Error:", err);
      ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Failed to process leave"),
      });
    }
  });
}
