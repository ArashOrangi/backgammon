import { getGame, saveGame } from "../../game/game.store";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";

type LeavePayload = {
  gameId: string;
};

export function handleLeave(
  ctx: SocketContext,
  payload: LeavePayload,
  rooms: RoomManager,
) {
  const { gameId } = payload;
  const game = getGame(gameId);

  if (!game) {
    ctx.send({
      type: "game.error",
      payload: { message: "Game not found" },
    });
    return;
  }

  try {
    const player = game.players.find((p) => p === ctx.id);

    if (!player) {
      ctx.send({
        type: "game.error",
        payload: { message: "Player not found in game" },
      });
      return;
    }

    game.players = game.players.filter((p) => p !== ctx.id);

    rooms.leave(ctx);

    saveGame(game);

    rooms.broadcast(game.id, {
      type: "game.state",
      payload: game,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to leave game";

    ctx.send({
      type: "game.error",
      payload: { message },
    });
  }
}
