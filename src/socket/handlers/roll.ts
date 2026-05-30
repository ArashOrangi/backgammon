import { getGame, saveGame } from "../../game/gameStore";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import {
  generateMoveSequences,
  flattenMoveSequences,
} from "@/game/moveGenerator";
import {
  rollDice,
  rollStartingDie,
  tryResolveStartingRoll,
} from "@/game/engine";
import { createInitialBoard } from "@/game/board";
import { GameQueue } from "@/game/gameQueue";
import { appendGameEvent, calculateSubStatus } from "@/game/eventStore";
import { getTimerPresetByLeagueAndType } from "@/models/timerPreset";

const gameQueue = new GameQueue();

type RollPayload = { gameId: number };

export async function handleRoll(
  ctx: SocketContext,
  payload: RollPayload,
  rooms: RoomManager,
) {
  const { gameId } = payload;
  const playerId = ctx.userId;

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
      // ---------- فاز تعیین شروع‌کننده (Starting) ----------
      if (game.status === "starting") {
        const value = rollStartingDie(game, playerId);

        await appendGameEvent(game.id, {
          type: "STARTING_ROLLED",
          payload: { playerId, value },
        });

        rooms.broadcast(gameId, {
          type: "dice.result",
          payload: onOkSocketResponse({
            dice: [value],
            playerId,
            type: "starting",
          }), // طبق سناریو، type: "starting"
        });

        const didStart = tryResolveStartingRoll(game);

        if (didStart) {
          const whitePlayer = game.players.find((p) => p.color === "white")!;
          const blackPlayer = game.players.find((p) => p.color === "black")!;

          // دریافت مقادیر تایمر از دیتابیس (Remote Config)
          let leagueLevel: number | undefined = undefined; // در آینده از پروفایل بازیکن خوانده شود
          const gameType = "casual";
          const preset = await getTimerPresetByLeagueAndType(
            leagueLevel,
            gameType,
          );
          const primarySeconds = preset?.primarySeconds ?? 12;
          const secondarySeconds = preset?.secondarySeconds ?? 120;

          game.board = createInitialBoard(whitePlayer.id, blackPlayer.id);

          await appendGameEvent(game.id, {
            type: "GAME_STARTED",
            payload: {
              whitePlayerId: whitePlayer.id,
              blackPlayerId: blackPlayer.id,
              startingPlayerId: game.turn!,
              primarySeconds,
              secondarySeconds,
            },
          });

          // ارسال پیام game.turn طبق سناریو
          rooms.broadcast(gameId, {
            type: "game.turn",
            payload: onOkSocketResponse({
              playerId: game.turn!,
              color: game.players.find((p) => p.id === game.turn)!.color,
            }),
          });
        }

        saveGame(game);
        const subStatus = calculateSubStatus(game);
        let legalMoves: any[] = [];
        if (game.turn !== null) {
          const moves = generateMoveSequences(game, game.turn);
          legalMoves = flattenMoveSequences(moves);
        }
        const stateToSend = { ...game, subStatus, legalMoves };
        rooms.broadcast(gameId, {
          type: "game.state",
          payload: onOkSocketResponse(stateToSend),
        });
        return;
      }

      // ---------- فاز تاس ریختن معمولی (In-Progress) ----------
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
        payload: onOkSocketResponse({ dice, playerId }),
      });

      const legalMovesSequences = generateMoveSequences(game, playerId);
      const flatLegalMoves = flattenMoveSequences(legalMovesSequences);
      if (legalMovesSequences.length === 0) {
        await appendGameEvent(game.id, {
          type: "TURN_PASSED",
          payload: { playerId, reason: "NO_LEGAL_MOVES" },
        });
      }

      saveGame(game);
      const subStatus = calculateSubStatus(game);
      const stateToSend = { ...game, subStatus, legalMoves: flatLegalMoves };
      rooms.broadcast(gameId, {
        type: "game.state",
        payload: onOkSocketResponse(stateToSend),
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
