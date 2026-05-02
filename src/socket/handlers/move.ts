import { getGame, saveGame } from "../../game/game.store";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";

import { applyMove, switchTurn } from "../../game/game.engine";
import { validateMove } from "../../game/rule-validator";

import { MovePayload } from "../../validations/game.move";

import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";

/**
 * Handle player move
 */
export function handleMove(
  ctx: SocketContext,
  payload: MovePayload,
  rooms: RoomManager,
) {
  const { gameId, from, to } = payload;

  const game = getGame(gameId);

  if (!game) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Game not found"),
    });
  }

  // Turn validation
  if (game.turn !== ctx.id) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("It's not your turn"),
    });
  }

  // Rule validation (game logic)
  const { valid, reason } = validateMove(game, ctx.id, from, to);

  if (!valid) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(reason ?? "Invalid move"),
    });
  }

  try {
    // Apply the actual move
    applyMove(game, ctx.id, from, to);

    // Switch to next player
    switchTurn(game);

    // Persist changes
    saveGame(game);

    // Broadcast updated state
    rooms.broadcast(game.id, {
      type: "game.state",
      payload: onOkSocketResponse(game),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to process move";

    ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(message),
    });
  }
}
