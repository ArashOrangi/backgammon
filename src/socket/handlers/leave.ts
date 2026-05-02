import { getGame, saveGame, deleteGame } from "../../game/game.store";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";

import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";

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
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Game not found"),
    });
  }

  try {
    const isPlayer = game.players.includes(ctx.id);

    if (!isPlayer) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Player not found in game"),
      });
    }

    // remove player
    game.players = game.players.filter((p) => p !== ctx.id);

    // remove from room
    rooms.leave(ctx);

    // اگر آخرین بازیکن خارج شد بازی حذف شود
    if (game.players.length === 0) {
      deleteGame(game.id);
      return;
    }

    saveGame(game);

    rooms.broadcast(game.id, {
      type: "game.state",
      payload: onOkSocketResponse(game),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to leave game";

    ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(message),
    });
  }
}
