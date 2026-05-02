import { getGame, saveGame } from "../../game/game.store";
import { rollDice, switchTurn } from "../../game/game.engine";
import { hasLegalMoves } from "../../game/rule-validator";

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
  const game = getGame(payload.gameId);

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

  if (game.turn !== ctx.id) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not your turn"),
    });
  }

  if (game.dice?.length) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Dice already rolled"),
    });
  }

  try {
    const dice = rollDice(game);

    // Auto-pass
    if (!hasLegalMoves(game, ctx.id)) {
      switchTurn(game);
      game.dice = undefined;

      saveGame(game);

      rooms.broadcast(game.id, {
        type: "game.state",
        payload: onOkSocketResponse(game, "No legal moves, turn passed"),
      });

      return;
    }

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
    ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(
        err instanceof Error ? err.message : "Failed to roll dice",
      ),
    });
  }
}
