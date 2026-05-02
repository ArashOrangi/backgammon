import { getGame, saveGame } from "../../game/game.store";
import { rollDice } from "../../game/game.engine";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";

import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";

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
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Game not found"),
    });
  }

  const isPlayer = game.players.includes(ctx.id);

  if (!isPlayer) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Player not in game"),
    });
  }

  if (game.turn !== ctx.id) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not your turn"),
    });
  }

  try {
    const dice = rollDice(game);

    saveGame(game);

    rooms.broadcast(game.id, {
      type: "game.roll",
      payload: onOkSocketResponse({ dice }),
    });

    rooms.broadcast(game.id, {
      type: "game.state",
      payload: onOkSocketResponse(game),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to roll dice";

    ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(message),
    });
  }
}
