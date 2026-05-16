import { getGame, saveGame } from "../../game/gameStore";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";

import { validateMove } from "../../game/ruleValidator";
import { generateMoveSequences, MoveSequence } from "../../game/moveGenerator";

import { MovePayload } from "../../validations/game.move";

import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import { applyMove, switchTurn } from "@/game/engine";

export function handleMove(
  ctx: SocketContext,
  payload: MovePayload,
  rooms: RoomManager,
) {
  const { gameId, from, to } = payload;
  const playerId = ctx.id;

  const game = getGame(gameId);

  if (!game) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Game not found"),
    });
  }

  if (game.turn !== playerId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("It's not your turn"),
    });
  }

  if (!game.dice || game.dice.length === 0) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Dice not rolled"),
    });
  }

  const { valid, reason } = validateMove(game, playerId, from, to);

  if (!valid) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(reason ?? "Invalid move"),
    });
  }

  try {
    applyMove(game, playerId, from, to);

    /* -------------------------------- */
    /* CHECK WIN CONDITION */
    /* -------------------------------- */

    if (game.board.borneOff[playerId] === 15) {
      game.status = "finished";
      game.winner = playerId;
      game.dice = undefined;

      saveGame(game);

      rooms.broadcast(game.id, {
        type: "game.state",
        payload: onOkSocketResponse(game, "Game over"),
      });

      return;
    }

    /* -------------------------------- */
    /* CALCULATE NEXT LEGAL MOVES */
    /* -------------------------------- */

    let legalMoves: MoveSequence[] = [];

    if (game.dice && game.dice.length > 0) {
      legalMoves = generateMoveSequences(game, playerId);
    }

    const mustPass = legalMoves.length === 0;

    if (mustPass) {
      game.dice = undefined;
      switchTurn(game);

      saveGame(game);

      rooms.broadcast(game.id, {
        type: "game.state",
        payload: onOkSocketResponse(game, "Turn passed"),
      });

      return;
    }

    /* -------------------------------- */
    /* NORMAL MOVE CONTINUE */
    /* -------------------------------- */

    saveGame(game);

    rooms.broadcast(game.id, {
      type: "game.state",
      payload: onOkSocketResponse(game),
    });

    rooms.broadcast(game.id, {
      type: "game.legalMoves",
      payload: onOkSocketResponse(legalMoves),
    });
  } catch (err) {
    ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(
        err instanceof Error ? err.message : "Move failed",
      ),
    });
  }
}
