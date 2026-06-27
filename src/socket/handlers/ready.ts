import { saveGame } from "../../game/gameStore";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import {
  appendGameEvent,
  loadGameState,
  calculateSubStatus,
} from "@/game/eventStore";
import { rollDie } from "@/utils/dice";
import { getDefaultTimerPreset } from "@/models/timerPreset";
import {
  generateMoveSequences,
  flattenMoveSequences,
} from "@/game/moveGenerator";
import { runBotIfNeeded } from "@/game/botRunner";

// ===== اصلاح: readyStates را export کنید =====
export const readyStates = new Map<number, Set<number>>();

// ===== اضافه شده: تابع برای علامت‌گذاری بات =====
export function markBotReady(gameId: number, botId: number) {
  if (!readyStates.has(gameId)) {
    readyStates.set(gameId, new Set());
  }
  const readySet = readyStates.get(gameId)!;
  if (!readySet.has(botId)) {
    readySet.add(botId);
    console.log(`[Ready] Bot ${botId} marked as ready for game ${gameId}`);
  }
}

// ===== بقیه‌ی کد بدون تغییر =====
export async function handleReady(
  ctx: SocketContext,
  payload: { gameId: number },
  rooms: RoomManager,
) {
  let { gameId } = payload;
  const userId = ctx.userId;

  if (!userId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not authenticated"),
    });
  }

  if (gameId <= 0) {
    const actualGameId = rooms.getRoomOfSocket(ctx);
    if (!actualGameId) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Invalid game ID and not in any room"),
      });
    }
    gameId = actualGameId;
  }
  if (gameId <= 0) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Still invalid game ID"),
    });
  }

  let game = await loadGameState(gameId);
  if (!game) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Game not found"),
    });
  }

  const player = game.players.find((p) => p.id === userId);
  if (!player) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Player not in game"),
    });
  }

  if (game.status === "in-progress") {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Game already started"),
    });
  }

  if (game.players.length < 2) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not enough players to start"),
    });
  }

  // ثبت آمادگی کاربر
  if (!readyStates.has(gameId)) {
    readyStates.set(gameId, new Set());
  }
  const readySet = readyStates.get(gameId)!;
  if (!readySet.has(userId)) {
    readySet.add(userId);
  }

  // اگر هر دو آماده شدند → شروع بازی
  if (readySet.size === 2) {
    const whitePlayer = game.players.find((p) => p.color === "white")!;
    const blackPlayer = game.players.find((p) => p.color === "black")!;

    let whiteDie: number, blackDie: number;
    let attempts = 0;
    do {
      whiteDie = rollDie();
      blackDie = rollDie();
      attempts++;
      await appendGameEvent(gameId, {
        type: "STARTING_ROLLED",
        payload: { playerId: whitePlayer.id, value: whiteDie },
      });
      await appendGameEvent(gameId, {
        type: "STARTING_ROLLED",
        payload: { playerId: blackPlayer.id, value: blackDie },
      });
    } while (whiteDie === blackDie && attempts < 10);

    rooms.broadcast(gameId, {
      type: "dice.result",
      payload: onOkSocketResponse({
        dice: [whiteDie, blackDie],
        playerId: 0,
        type: "starting",
      }),
    });

    const startingPlayerId =
      whiteDie > blackDie ? whitePlayer.id : blackPlayer.id;
    const timerSettings = await getDefaultTimerPreset();

    await appendGameEvent(gameId, {
      type: "GAME_STARTED",
      payload: {
        whitePlayerId: whitePlayer.id,
        blackPlayerId: blackPlayer.id,
        startingPlayerId,
        primarySeconds: timerSettings.primarySeconds,
        secondarySeconds: timerSettings.secondarySeconds,
        dice: [whiteDie, blackDie],
      },
    });

    const freshGame = await loadGameState(gameId);
    if (!freshGame) throw new Error("Failed to reload game after start");

    readyStates.delete(gameId);
    saveGame(freshGame);

    const subStatus = calculateSubStatus(freshGame);
    const legalMoves = freshGame.turn
      ? generateMoveSequences(freshGame, freshGame.turn)
      : [];
    const flatLegalMoves = flattenMoveSequences(legalMoves);
    const stateToSend = {
      ...freshGame,
      subStatus,
      legalMoves: flatLegalMoves,
    };

    rooms.broadcast(gameId, {
      type: "game.state",
      payload: onOkSocketResponse(stateToSend, "Game started automatically"),
    });

    rooms.broadcast(gameId, {
      type: "game.turn",
      payload: onOkSocketResponse({
        playerId: freshGame.turn!,
        color: freshGame.players.find((p) => p.id === freshGame.turn)!.color,
      }),
    });

    if (freshGame.status === "in-progress") {
      await runBotIfNeeded(gameId, freshGame.turn!, rooms);
    }
  } else {
    const stateToSend = {
      ...game,
      subStatus: "playerJoin" as const,
    };
    ctx.send({
      type: "game.state",
      payload: onOkSocketResponse(stateToSend, "Waiting for opponent to ready"),
    });
  }
}
