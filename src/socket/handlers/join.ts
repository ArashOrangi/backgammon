import { addPlayerToGame, getGame } from "../../game/game.store";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";

type JoinPayload = {
  gameId: string;
};

export function handleJoin(
  ctx: SocketContext,
  payload: JoinPayload,
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
    const updatedGame = addPlayerToGame(game, ctx.id);

    rooms.join(game.id, ctx);

    rooms.broadcast(game.id, {
      type: "game.join",
      payload: {
        success: true,
        message: "Player joined",
      },
    });

    rooms.broadcast(game.id, {
      type: "game.state",
      payload: updatedGame,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to join game";

    ctx.send({
      type: "game.error",
      payload: { message },
    });
  }
}
