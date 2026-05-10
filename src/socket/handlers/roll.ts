import { getGame, saveGame } from "../../game/game.store";
import { appendGameEvent, loadGameState } from "../../game/eventStore";
import {
  rollDice,
  rollStartingDie,
  tryResolveStartingRoll,
  switchTurn,
} from "../../game/game.engine";

import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";

import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";

import { generateMoveSequences } from "@/game/move.generator";

type RollPayload = {
  gameId: string;
};

export async function handleRoll(
  ctx: SocketContext,
  payload: RollPayload,
  rooms: RoomManager,
) {
  const game = getGame(payload.gameId);

  if (!game) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Game not found"),
    });
  }

  if (!game.players.some((p) => p.id === ctx.id)) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Player not in game"),
    });
  }

  if (game.status !== "starting" && game.turn !== ctx.id) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not your turn"),
    });
  }

  try {
    if (game.status === "starting") {
      const value = rollStartingDie(game, ctx.id);

      await appendGameEvent(Number(game.id), {
        type: "STARTING_ROLLED",
        payload: {
          playerId: ctx.id,
          value,
        },
      });

      let updatedGame = await loadGameState(Number(game.id));
      if (!updatedGame) {
        throw new Error("Failed to rebuild game state after STARTING_ROLLED");
      }

      rooms.broadcast(game.id, {
        type: "game.startRoll",
        payload: onOkSocketResponse({
          player: ctx.id,
          value,
        }),
      });

      // اگر engine هنوز logic resolve را در state memory انجام می‌دهد:
      tryResolveStartingRoll(updatedGame);

      // اگر همچنان tie یا incomplete است
      if (updatedGame.status === "starting") {
        saveGame(updatedGame);

        rooms.broadcast(game.id, {
          type: "game.state",
          payload: onOkSocketResponse(updatedGame),
        });

        return;
      }

      const whitePlayer = updatedGame.players.find((p) => p.color === "white");
      const blackPlayer = updatedGame.players.find((p) => p.color === "black");

      if (!whitePlayer || !blackPlayer || !updatedGame.turn) {
        throw new Error(
          "Cannot start game: players or starting player missing",
        );
      }

      await appendGameEvent(Number(game.id), {
        type: "GAME_STARTED",
        payload: {
          whitePlayerId: whitePlayer.id,
          blackPlayerId: blackPlayer.id,
          startingPlayerId: updatedGame.turn,
        },
      });

      updatedGame = await loadGameState(Number(game.id));
      if (!updatedGame) {
        throw new Error("Failed to rebuild game state after GAME_STARTED");
      }

      saveGame(updatedGame);

      rooms.broadcast(game.id, {
        type: "game.state",
        payload: onOkSocketResponse(updatedGame),
      });

      const legal = generateMoveSequences(updatedGame, updatedGame.turn!);

      rooms.broadcast(game.id, {
        type: "game.legalMoves",
        payload: onOkSocketResponse(legal),
      });

      return;
    }

    if (game.dice?.length) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Dice already rolled"),
      });
    }

    const dice = rollDice(game);

    await appendGameEvent(Number(game.id), {
      type: "DICE_ROLLED",
      payload: {
        playerId: ctx.id,
        dice,
      },
    });

    let updatedGame = await loadGameState(Number(game.id));
    if (!updatedGame) {
      throw new Error("Failed to rebuild game state after DICE_ROLLED");
    }

    const legal = generateMoveSequences(updatedGame, ctx.id);

    if (!legal.length) {
      await appendGameEvent(Number(game.id), {
        type: "TURN_PASSED",
        payload: {
          playerId: ctx.id,
          reason: "NO_LEGAL_MOVES",
        },
      });

      updatedGame = await loadGameState(Number(game.id));
      if (!updatedGame) {
        throw new Error("Failed to rebuild game state after TURN_PASSED");
      }

      saveGame(updatedGame);

      rooms.broadcast(game.id, {
        type: "game.state",
        payload: onOkSocketResponse(updatedGame, "No legal moves, turn passed"),
      });

      return;
    }

    saveGame(updatedGame);

    rooms.broadcast(game.id, {
      type: "game.roll",
      payload: onOkSocketResponse({
        player: ctx.id,
        dice,
      }),
    });

    rooms.broadcast(game.id, {
      type: "game.state",
      payload: onOkSocketResponse(updatedGame),
    });

    rooms.broadcast(game.id, {
      type: "game.legalMoves",
      payload: onOkSocketResponse(legal),
    });
  } catch (err) {
    ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(
        err instanceof Error ? err.message : "Failed to roll dice",
      ),
    });
  }
}
