import { getGame, saveGame } from "../../game/game.store";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import { applyMove } from "../../game/game.engine";
import { validateMove } from "../../game/rule-validator";
import { MovePayload } from "../../validations/game.move";

import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";

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

  // Rule validation
  const { valid, reason } = validateMove(game, ctx.id, from, to);

  if (!valid) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(reason ?? "Invalid move"),
    });
  }

  try {
    applyMove(game, ctx.id, from, to);

    saveGame(game);

    rooms.broadcast(game.id, {
      type: "game.state",
      payload: onOkSocketResponse(game),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to make move";

    ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(message),
    });
  }
}
