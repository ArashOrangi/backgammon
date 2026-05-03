import { getGame, saveGame } from "../../game/game.store";
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

export function handleRoll(
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

  /* --------------------------------------------------------
   * VALIDATIONS
   * --------------------------------------------------------
   */

  // must be one of game players
  if (!game.players.some((p) => p.id === ctx.id)) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Player not in game"),
    });
  }

  // turn check (except starting phase)
  if (game.status !== "starting" && game.turn !== ctx.id) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not your turn"),
    });
  }

  try {
    /* --------------------------------------------------------
     * STARTING PHASE
     * --------------------------------------------------------
     */
    if (game.status === "starting") {
      const value = rollStartingDie(game, ctx.id);

      rooms.broadcast(game.id, {
        type: "game.startRoll",
        payload: onOkSocketResponse({
          player: ctx.id,
          value,
        }),
      });

      // resolves: tie or winner
      tryResolveStartingRoll(game);

      // still starting? (tie)
      if (game.status === "starting") {
        saveGame(game);
        return;
      }

      // game started, opening dice assigned internally
      saveGame(game);

      rooms.broadcast(game.id, {
        type: "game.state",
        payload: onOkSocketResponse(game),
      });

      // send legal moves for opening roll
      const legal = generateMoveSequences(game, game.turn);

      rooms.broadcast(game.id, {
        type: "game.legalMoves",
        payload: onOkSocketResponse(legal),
      });

      return;
    }

    /* --------------------------------------------------------
     * NORMAL GAME ROLL
     * --------------------------------------------------------
     */

    // dice already present → can't roll again
    if (game.dice?.length) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Dice already rolled"),
      });
    }

    // roll normally
    const dice = rollDice(game);

    // compute legal moves for this player
    const legal = generateMoveSequences(game, ctx.id);

    // AUTO-PASS: no legal moves
    if (!legal.length) {
      game.dice = undefined;
      switchTurn(game);
      saveGame(game);

      rooms.broadcast(game.id, {
        type: "game.state",
        payload: onOkSocketResponse(game, "No legal moves, turn passed"),
      });

      return;
    }

    // NORMAL CASE: player has legal moves
    saveGame(game);

    rooms.broadcast(game.id, {
      type: "game.roll",
      payload: onOkSocketResponse({
        player: ctx.id,
        dice,
      }),
    });

    rooms.broadcast(game.id, {
      type: "game.state",
      payload: onOkSocketResponse(game),
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
