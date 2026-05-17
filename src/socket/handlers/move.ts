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

import { appendGameEvent, loadGameState } from "@/game/eventStore";

export async function handleMove(
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
    /* -------------------------------- */
    /* APPEND MOVE EVENT */
    /* -------------------------------- */

    await appendGameEvent(Number(game.id), {
      type: "MOVE_APPLIED",
      payload: {
        playerId,
        from,
        to,
      },
    });

    let updatedGame = await loadGameState(Number(game.id));

    if (!updatedGame) {
      throw new Error("Failed to rebuild state after MOVE_APPLIED");
    }

    /* -------------------------------- */
    /* CHECK WIN CONDITION */
    /* -------------------------------- */

    if (updatedGame.board.borneOff[playerId] === 15) {
      await appendGameEvent(Number(updatedGame.id), {
        type: "GAME_FINISHED",
        payload: {
          winner: playerId,
          winType: "normal",
        },
      });

      updatedGame = await loadGameState(Number(updatedGame.id));
      if (!updatedGame) {
        throw new Error("Game not found after event append");
      }
      saveGame(updatedGame);

      rooms.broadcast(updatedGame.id, {
        type: "game.state",
        payload: onOkSocketResponse(updatedGame, "Game over"),
      });

      return;
    }

    /* -------------------------------- */
    /* CALCULATE NEXT LEGAL MOVES */
    /* -------------------------------- */

    let legalMoves: MoveSequence[] = [];

    if (updatedGame.dice && updatedGame.dice.length > 0) {
      legalMoves = generateMoveSequences(updatedGame, playerId);
    }

    const mustPass = legalMoves.length === 0;

    if (mustPass) {
      await appendGameEvent(Number(updatedGame.id), {
        type: "TURN_PASSED",
        payload: {
          playerId,
          reason: "NO_LEGAL_MOVES",
        },
      });

      updatedGame = await loadGameState(Number(updatedGame.id));
      if (!updatedGame) {
        throw new Error("Game state could not be loaded");
      }
      saveGame(updatedGame);

      rooms.broadcast(updatedGame.id, {
        type: "game.state",
        payload: onOkSocketResponse(updatedGame, "Turn passed"),
      });

      return;
    }

    /* -------------------------------- */
    /* NORMAL CONTINUE */
    /* -------------------------------- */

    saveGame(updatedGame);

    rooms.broadcast(updatedGame.id, {
      type: "game.state",
      payload: onOkSocketResponse(updatedGame),
    });

    rooms.broadcast(updatedGame.id, {
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
