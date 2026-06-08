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
import { GameQueue } from "@/game/gameQueue";
import {
  appendGameEvent,
  loadGameState,
  calculateSubStatus,
} from "@/game/eventStore";
import { getTimerPresetByLeagueAndType } from "@/models/timerPreset";
import { runBotIfNeeded } from "@/game/botRunner";

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
    let game = await loadGameState(gameId);
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

        const afterFirstRoll = await loadGameState(gameId);
        if (!afterFirstRoll)
          throw new Error("Failed to reload after starting roll");
        game = afterFirstRoll;
        saveGame(game);

        rooms.broadcast(gameId, {
          type: "dice.result",
          payload: onOkSocketResponse({
            dice: [value],
            playerId,
            type: "starting",
          }),
        });

        const didStart = tryResolveStartingRoll(game);

        if (didStart) {
          const preset = await getTimerPresetByLeagueAndType(
            undefined,
            "casual",
          );
          const primarySeconds = preset?.primarySeconds ?? 12;
          const secondarySeconds = preset?.secondarySeconds ?? 120;

          const whitePlayer = game.players.find((p) => p.color === "white")!;
          const blackPlayer = game.players.find((p) => p.color === "black")!;

          await appendGameEvent(game.id, {
            type: "GAME_STARTED",
            payload: {
              whitePlayerId: whitePlayer.id,
              blackPlayerId: blackPlayer.id,
              startingPlayerId: game.turn!,
              primarySeconds,
              secondarySeconds,
              dice: [game.dice?.[0] ?? 0, game.dice?.[1] ?? 0],
            },
          });

          const freshGame = await loadGameState(gameId);
          if (!freshGame)
            throw new Error("Failed to reload after GAME_STARTED");
          game = freshGame;
          saveGame(game);

          rooms.broadcast(gameId, {
            type: "game.turn",
            payload: onOkSocketResponse({
              playerId: freshGame.turn!,
              color: freshGame.players.find((p) => p.id === freshGame.turn)!
                .color,
            }),
          });
        }

        const subStatus = calculateSubStatus(game);
        const legalMoves = game.turn
          ? generateMoveSequences(game, game.turn)
          : [];
        const flatLegalMoves = flattenMoveSequences(legalMoves);
        const stateToSend = { ...game, subStatus, legalMoves: flatLegalMoves };
        rooms.broadcast(gameId, {
          type: "game.state",
          payload: onOkSocketResponse(stateToSend),
        });

        if (game.status === "in-progress") {
          await runBotIfNeeded(gameId, game.turn!, rooms);
        }
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

      const afterRoll = await loadGameState(gameId);
      if (!afterRoll) throw new Error("Failed to reload after dice roll");
      game = afterRoll;
      saveGame(game);

      rooms.broadcast(gameId, {
        type: "dice.result",
        payload: onOkSocketResponse({ dice, playerId, type: "inGame" }),
      });

      const legalMovesSequences = generateMoveSequences(game, playerId);
      const flatLegalMoves = flattenMoveSequences(legalMovesSequences);
      console.log(`[ROLL] legalMoves count = ${legalMovesSequences.length}`);

      // اگر هیچ حرکت قانونی وجود نداشت، خودکار نوبت را تمام کن
      if (legalMovesSequences.length === 0) {
        await appendGameEvent(game.id, {
          type: "TURN_PASSED",
          payload: { playerId, reason: "NO_LEGAL_MOVES" },
        });
        const afterTurnPass = await loadGameState(gameId);
        if (afterTurnPass) {
          game = afterTurnPass;
          saveGame(game);
        }
      }

      const subStatus = calculateSubStatus(game);
      const stateToSend = { ...game, subStatus, legalMoves: flatLegalMoves };
      rooms.broadcast(gameId, {
        type: "game.state",
        payload: onOkSocketResponse(stateToSend),
      });

      if (game.status === "in-progress") {
        await runBotIfNeeded(gameId, game.turn!, rooms);
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
  });
}
