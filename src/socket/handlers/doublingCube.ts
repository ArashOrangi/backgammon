import { saveGame } from "@/game/gameStore";
import {
  appendGameEvent,
  calculateSubStatus,
  loadGameState,
} from "@/game/eventStore";
import {
  calculateGameScore,
  broadcastTimerStarted,
  canOfferDouble,
  getCubeValue,
} from "@/game/engine";
import { GameQueue } from "@/game/gameQueue";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import { RoomManager } from "../room-manager";
import { SocketContext } from "../socket-context";
import { BOT_USER_ID } from "@/static/statics";

const gameQueue = new GameQueue();

export async function handleCubeOffer(
  ctx: SocketContext,
  payload: { gameId: number },
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

  await gameQueue.enqueue(gameId, async () => {
    const game = await loadGameState(gameId);
    if (!game) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Game not found"),
      });
    }

    const offer = canOfferDouble(game, playerId);
    if (!offer.ok) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse(offer.reason),
      });
    }

    await appendGameEvent(gameId, {
      type: "CUBE_OFFERED",
      payload: {
        offeredBy: playerId,
        offeredTo: offer.opponentId,
        value: offer.nextValue,
      },
    });

    const updatedGame = await loadGameState(gameId);
    if (!updatedGame) throw new Error("Failed to reload game after cube offer");

    saveGame(updatedGame);

    rooms.broadcast(gameId, {
      type: "game.cube.offer",
      payload: onOkSocketResponse({
        offeredBy: playerId,
        offeredTo: offer.opponentId,
        value: offer.nextValue,
        previousValue: getCubeValue(game),
      }),
    });

    if (offer.opponentId === BOT_USER_ID) {
      await appendGameEvent(gameId, {
        type: "CUBE_ACCEPTED",
        payload: {
          acceptedBy: offer.opponentId,
          offeredBy: playerId,
          value: offer.nextValue,
        },
      });

      const afterBotAccept = await loadGameState(gameId);
      if (!afterBotAccept) {
        throw new Error("Failed to reload game after bot cube accept");
      }

      saveGame(afterBotAccept);

      rooms.broadcast(gameId, {
        type: "game.cube.accepted",
        payload: onOkSocketResponse({
          acceptedBy: offer.opponentId,
          offeredBy: playerId,
          value: offer.nextValue,
          owner: offer.opponentId,
        }),
      });

      if (afterBotAccept.turn) {
        broadcastTimerStarted(
          gameId,
          afterBotAccept.turn,
          afterBotAccept.primaryTimePerTurn,
          afterBotAccept.secondaryTimeBank[afterBotAccept.turn] || 0,
          afterBotAccept.turnStartedAt!,
          rooms,
        );
      }

      rooms.broadcast(gameId, {
        type: "game.state",
        payload: onOkSocketResponse({
          ...afterBotAccept,
          subStatus: calculateSubStatus(afterBotAccept),
          legalMoves: [],
        }),
      });

      return;
    }

    rooms.broadcast(gameId, {
      type: "game.state",
      payload: onOkSocketResponse({
        ...updatedGame,
        subStatus: calculateSubStatus(updatedGame),
        legalMoves: [],
      }),
    });
  });
}

export async function handleCubeRespond(
  ctx: SocketContext,
  payload: { gameId: number; accept: boolean },
  rooms: RoomManager,
) {
  const { gameId, accept } = payload;
  const playerId = ctx.userId;

  if (!playerId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not authenticated"),
    });
  }

  await gameQueue.enqueue(gameId, async () => {
    const game = await loadGameState(gameId);
    if (!game) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Game not found"),
      });
    }

    if (!game.cubeOfferedBy || !game.cubeOfferedTo || !game.cubeOfferedValue) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("No pending doubling cube offer"),
      });
    }

    if (game.cubeOfferedTo !== playerId) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("This doubling cube offer is not for you"),
      });
    }

    if (accept) {
      await appendGameEvent(gameId, {
        type: "CUBE_ACCEPTED",
        payload: {
          acceptedBy: playerId,
          offeredBy: game.cubeOfferedBy,
          value: game.cubeOfferedValue,
        },
      });

      const updatedGame = await loadGameState(gameId);
      if (!updatedGame) {
        throw new Error("Failed to reload game after cube accept");
      }

      saveGame(updatedGame);

      rooms.broadcast(gameId, {
        type: "game.cube.accepted",
        payload: onOkSocketResponse({
          acceptedBy: playerId,
          offeredBy: game.cubeOfferedBy,
          value: game.cubeOfferedValue,
          owner: playerId,
        }),
      });

      if (updatedGame.turn) {
        broadcastTimerStarted(
          gameId,
          updatedGame.turn,
          updatedGame.primaryTimePerTurn,
          updatedGame.secondaryTimeBank[updatedGame.turn] || 0,
          updatedGame.turnStartedAt!,
          rooms,
        );
      }

      rooms.broadcast(gameId, {
        type: "game.state",
        payload: onOkSocketResponse({
          ...updatedGame,
          subStatus: calculateSubStatus(updatedGame),
          legalMoves: [],
        }),
      });

      return;
    }

    const score = calculateGameScore(game, "normal");

    await appendGameEvent(gameId, {
      type: "CUBE_REJECTED",
      payload: {
        rejectedBy: playerId,
        offeredBy: game.cubeOfferedBy,
        score,
      },
    });

    const updatedGame = await loadGameState(gameId);
    if (!updatedGame) throw new Error("Failed to reload game after cube reject");

    saveGame(updatedGame);

    rooms.broadcast(gameId, {
      type: "game.cube.rejected",
      payload: onOkSocketResponse({
        rejectedBy: playerId,
        winner: game.cubeOfferedBy,
        score,
      }),
    });

    rooms.broadcast(gameId, {
      type: "game.result",
      payload: onOkSocketResponse({
        winner: game.cubeOfferedBy,
        winType: "normal",
        reason: "DOUBLE_REJECTED",
        score,
      }),
    });

    rooms.broadcast(gameId, {
      type: "game.state",
      payload: onOkSocketResponse({
        ...updatedGame,
        subStatus: calculateSubStatus(updatedGame),
        legalMoves: [],
      }),
    });
  });
}
