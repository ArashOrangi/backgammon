import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import { RoomManager } from "@/socket/room-manager";
import { SocketContext } from "@/socket/socket-context";
import { MovePayload } from "@/validations/game.move";
import { getGame, saveGame } from "./game.store";
import { hasLegalMoves, validateMove } from "./rule-validator";
import { applyMove, switchTurn } from "./game.engine";

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

  if (!game.players.includes(ctx.id)) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Player not in game"),
    });
  }

  // --- Turn Validation ---
  if (game.turn !== ctx.id) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("It's not your turn"),
    });
  }

  // --- Dice must exist before any move ---
  if (!game.dice || game.dice.length === 0) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Roll dice first"),
    });
  }

  // --- Rule Validation ---
  const { valid, reason } = validateMove(game, ctx.id, from, to);

  if (!valid) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(reason ?? "Invalid move"),
    });
  }

  try {
    // --- Apply Move ---
    applyMove(game, ctx.id, from, to);

    // --- Game End Check ---
    if (game.board.borneOff[ctx.id] === 15) {
      saveGame(game);

      rooms.broadcast(game.id, {
        type: "game.state",
        payload: onOkSocketResponse(game, "Game finished"),
      });

      return;
    }

    // --- Turn Management (dice logic) ---
    const noDiceLeft = game.dice.length === 0;

    if (noDiceLeft) {
      // No dice → switch turn
      switchTurn(game);
      game.dice = undefined;
    } else if (!hasLegalMoves(game, ctx.id)) {
      // Dice remain but no legal moves
      switchTurn(game);
      game.dice = undefined;
    }

    // --- Persist state ---
    saveGame(game);

    // --- Broadcast Updated State ---
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
