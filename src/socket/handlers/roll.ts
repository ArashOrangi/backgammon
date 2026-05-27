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
import { GameQueue } from "@/game/gameQueue";
import { appendGameEvent } from "@/game/eventStore";

const gameQueue = new GameQueue();

type RollPayload = { gameId: number };

export async function handleRoll(
  ctx: SocketContext,
  payload: RollPayload,
  rooms: RoomManager,
) {
  const { gameId } = payload;
  const playerId = ctx.userId; // شناسه عددی کاربر

  // بررسی احراز هویت
  if (!playerId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not authenticated"),
    });
  }

  await gameQueue.enqueue(gameId, async () => {
    const game = getGame(gameId);
    if (!game) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Game not found"),
      });
    }

    const currentPlayer = game.players.find((p) => p.id === playerId);
    if (!currentPlayer) {
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
      // فاز تعیین شروع‌کننده (Starting)
      if (game.status === "starting") {
        const value = rollStartingDie(game, playerId);

        await appendGameEvent(game.id, {
          type: "STARTING_ROLLED",
          payload: { playerId, value },
        });

        rooms.broadcast(gameId, {
          type: "dice.result",
          payload: { dice: [value], playerId },
        });

        const didStart = tryResolveStartingRoll(game);

        if (didStart) {
          const whitePlayer = game.players.find((p) => p.color === "white")!;
          const blackPlayer = game.players.find((p) => p.color === "black")!;

          game.board = createInitialBoard(whitePlayer.id, blackPlayer.id);

          await appendGameEvent(game.id, {
            type: "GAME_STARTED",
            payload: {
              whitePlayerId: whitePlayer.id,
              blackPlayerId: blackPlayer.id,
              startingPlayerId: game.turn!,
            },
          });

          rooms.broadcast(gameId, {
            type: "game.turn",
            payload: {
              playerId: game.turn!,
              color: game.players.find((p) => p.id === game.turn)!.color,
            },
          });
        }

        saveGame(game);
        rooms.broadcast(gameId, {
          type: "game.state",
          payload: onOkSocketResponse(game),
        });
        return;
      }

      // فاز تاس ریختن معمولی (In-Progress)
      if (game.dice && game.dice.length > 0) {
        return ctx.send({
          type: "game.error",
          payload: onErrorSocketResponse("Dice already rolled"),
        });
      }

      const dice = rollDice(game);

      await appendGameEvent(game.id, {
        type: "DICE_ROLLED",
        payload: { playerId, dice },
      });

      rooms.broadcast(gameId, {
        type: "dice.result",
        payload: { dice, playerId },
      });

      const legalMoves = generateMoveSequences(game, playerId);

      if (legalMoves.length === 0) {
        await appendGameEvent(game.id, {
          type: "TURN_PASSED",
          payload: { playerId, reason: "NO_LEGAL_MOVES" },
        });

        rooms.broadcast(gameId, {
          type: "game.turn",
          payload: {
            playerId: game.turn!,
            color: game.players.find((p) => p.id === game.turn)!.color,
          },
        });
      } else {
        // ارسال حرکات قانونی به کلاینت
        rooms.broadcast(gameId, {
          type: "game.legalMoves",
          payload: onOkSocketResponse(legalMoves),
        });
      }

      saveGame(game);
      rooms.broadcast(gameId, {
        type: "game.state",
        payload: onOkSocketResponse(game),
      });
    } catch (err) {
      console.error("Roll Error:", err);
      ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse(
          err instanceof Error ? err.message : "Roll failed",
        ),
      });
    }
  });
}
