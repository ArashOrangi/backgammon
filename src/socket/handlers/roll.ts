import { getGame, saveGame } from "../../game/game.store";
import { rollDice } from "../../game/game.engine";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";

type RollPayload = {
  gameId: string;
};

export function handleRoll(
  ctx: SocketContext,
  payload: RollPayload,
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
    const dice = rollDice(game);
    saveGame(game);

    rooms.broadcast(game.id, {
      type: "game.roll",
      payload: { dice },
    });

    rooms.broadcast(game.id, {
      type: "game.state",
      payload: game,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to roll dice";

    ctx.send({
      type: "game.error",
      payload: { message },
    });
  }
}
