import { getGame, saveGame } from "../../game/gameStore";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import { generateMoveSequences } from "@/game/moveGenerator";
import {
  rollDice,
  rollStartingDie,
  tryResolveStartingRoll,
} from "@/game/engine";
import { createInitialBoard } from "@/game/board";

type RollPayload = { gameId: string };

export async function handleRoll(
  ctx: SocketContext,
  payload: RollPayload,
  rooms: RoomManager,
) {
  const { gameId } = payload;
  const playerId = ctx.id;
  const game = getGame(gameId);

  if (!game) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Game not found"),
    });
  }

  if (!game.players.some((p) => p.id === playerId)) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Player not in game"),
    });
  }

  if (game.status !== "starting" && game.turn !== playerId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not your turn"),
    });
  }

  try {
    if (game.status === "starting") {
      const value = rollStartingDie(game, playerId);
      rooms.broadcast(gameId, {
        type: "game.startRoll",
        payload: onOkSocketResponse({ player: playerId, value }),
      });
      tryResolveStartingRoll(game);

      const newStatus: string = game.status;
      if (newStatus === "in-progress") {
        const whitePlayer = game.players.find((p) => p.color === "white");
        const blackPlayer = game.players.find((p) => p.color === "black");
        if (whitePlayer && blackPlayer) {
          const isEmpty = game.board.points.every((p) => p.owner === null);
          if (isEmpty) {
            game.board = createInitialBoard(whitePlayer.id, blackPlayer.id);
          }
        }
      }

      saveGame(game);
      rooms.broadcast(gameId, {
        type: "game.state",
        payload: onOkSocketResponse(game),
      });

      if (newStatus === "in-progress") {
        if (game.dice && game.dice.length > 0 && game.turn) {
          try {
            const legal = generateMoveSequences(game, game.turn);
            rooms.broadcast(gameId, {
              type: "game.legalMoves",
              payload: onOkSocketResponse(legal),
            });
          } catch (err) {
            console.error("Error generating legal moves:", err);
          }
        } else {
          console.warn(
            "No dice or turn available after starting roll. Skipping legal moves.",
          );
        }
      }
      return;
    }

    // ریختن تاس معمولی
    if (game.dice?.length) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Dice already rolled"),
      });
    }

    const dice = rollDice(game);
    saveGame(game);
    rooms.broadcast(gameId, {
      type: "game.roll",
      payload: onOkSocketResponse({ player: playerId, dice }),
    });
    rooms.broadcast(gameId, {
      type: "game.state",
      payload: onOkSocketResponse(game),
    });

    if (game.dice && game.dice.length > 0) {
      const legal = generateMoveSequences(game, playerId);
      if (!legal.length) {
        const idx = game.players.findIndex((p) => p.id === game.turn);
        const next = (idx + 1) % game.players.length;
        game.turn = game.players[next].id;
        game.dice = undefined;
        saveGame(game);
        rooms.broadcast(gameId, {
          type: "game.state",
          payload: onOkSocketResponse(game),
        });
      } else {
        rooms.broadcast(gameId, {
          type: "game.legalMoves",
          payload: onOkSocketResponse(legal),
        });
      }
    } else {
      // اگر تاس وجود نداشت (نباید رخ دهد)، نوبت را عوض کن
      console.warn("No dice after roll. Skipping move generation.");
      const idx = game.players.findIndex((p) => p.id === game.turn);
      const next = (idx + 1) % game.players.length;
      game.turn = game.players[next].id;
      game.dice = undefined;
      saveGame(game);
      rooms.broadcast(gameId, {
        type: "game.state",
        payload: onOkSocketResponse(game),
      });
    }
  } catch (err) {
    console.error("Roll Error:", err);
    ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(
        err instanceof Error ? err.message : "Roll failed",
      ),
    });
  }
}
