import { getGame, saveGame } from "../../game/game.store";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import { applyMove } from "../../game/game.engine";
import { validateMove } from "../../game/rule-validator";
import { MovePayload } from "../../validations/game.move";

export function handleMove(
  ctx: SocketContext,
  payload: MovePayload,
  rooms: RoomManager,
) {
  const { gameId, from, to } = payload;

  const game = getGame(gameId);

  if (!game) {
    ctx.send({
      type: "game.error",
      payload: { message: "Game not found" },
    });
    return;
  }

  // ✅ Rule-level validation (جای درستش اینجاست)
  const { valid, reason } = validateMove(game, ctx.id, from, to);

  if (!valid) {
    ctx.send({
      type: "game.error",
      payload: { message: reason ?? "Invalid move" },
    });
    return;
  }

  try {
    applyMove(game, ctx.id, from, to);

    saveGame(game);

    rooms.broadcast(game.id, {
      type: "game.state",
      payload: game,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to make move";

    ctx.send({
      type: "game.error",
      payload: { message },
    });
  }
}
