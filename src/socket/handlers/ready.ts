import { getGame, saveGame } from "../../game/gameStore";
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
import { createInitialBoard } from "@/game/board";
import { rollDie } from "@/utils/dice";
import { getDefaultTimerPreset } from "@/models/timerPreset";
import {
  generateMoveSequences,
  flattenMoveSequences,
} from "@/game/moveGenerator";

export async function handleReady(
  ctx: SocketContext,
  payload: { gameId: number },
  rooms: RoomManager,
) {
  const { gameId } = payload;
  const userId = ctx.userId;

  if (!userId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not authenticated"),
    });
  }

  const game = getGame(gameId);
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

  if (game.status !== "ready") {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Game is not in ready state"),
    });
  }

  if (!game.readyPlayers) game.readyPlayers = [];
  if (!game.readyPlayers.includes(userId)) {
    game.readyPlayers.push(userId);
    saveGame(game);
  }

  // اگر هر دو بازیکن آماده شدند → شروع خودکار بازی
  if (game.readyPlayers.length === 2) {
    const whitePlayer = game.players.find((p) => p.color === "white")!;
    const blackPlayer = game.players.find((p) => p.color === "black")!;

    let whiteDie: number, blackDie: number;
    let attempts = 0;

    // حلقه تا زمانی که تاس‌ها مساوی نباشند
    do {
      whiteDie = rollDie();
      blackDie = rollDie();
      attempts++;

      // ثبت ایونت‌های STARTING_ROLLED (برای هر بار تلاش)
      await appendGameEvent(gameId, {
        type: "STARTING_ROLLED",
        payload: { playerId: whitePlayer.id, value: whiteDie },
      });
      await appendGameEvent(gameId, {
        type: "STARTING_ROLLED",
        payload: { playerId: blackPlayer.id, value: blackDie },
      });
    } while (whiteDie === blackDie && attempts < 10); // حداکثر 10 بار برای اطمینان

    // ارسال تاس شروع به هر دو کلاینت
    rooms.broadcast(gameId, {
      type: "dice.result",
      payload: onOkSocketResponse({
        dice: [whiteDie, blackDie],
        playerId: 0,
        type: "starting",
      }),
    });

    // تعیین شروع‌کننده (کسی که تاس بزرگتری دارد)
    const startingPlayerId =
      whiteDie > blackDie ? whitePlayer.id : blackPlayer.id;
    const dice = [whiteDie, blackDie]; // تاس‌هایی که بازی با آنها شروع می‌شود

    // ساخت تخته اولیه
    game.board = createInitialBoard(whitePlayer.id, blackPlayer.id);

    // دریافت تنظیمات تایمر
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

    // به‌روزرسانی وضعیت بازی در حافظه
    game.status = "in-progress";
    game.turn = startingPlayerId;
    game.dice = dice; // ⭐ تاس‌های شروع را نگه می‌داریم
    game.turnStartedAt = Date.now();
    game.lastActionAt = Date.now();
    delete game.readyPlayers;
    saveGame(game);

    // محاسبه زیروضعیت و حرکات قانونی برای وضعیت فعلی
    const subStatus = calculateSubStatus(game);
    const legalMoves = generateMoveSequences(game, game.turn);
    const flatLegalMoves = flattenMoveSequences(legalMoves);
    const stateToSend = {
      ...game,
      subStatus,
      legalMoves: flatLegalMoves,
    };

    // برودکست وضعیت کامل بازی (شامل dice و legalMoves)
    rooms.broadcast(gameId, {
      type: "game.state",
      payload: onOkSocketResponse(stateToSend, "Game started automatically"),
    });

    // ارسال پیام نوبت
    rooms.broadcast(gameId, {
      type: "game.turn",
      payload: onOkSocketResponse({
        playerId: startingPlayerId,
        color: startingPlayerId === whitePlayer.id ? "white" : "black",
      }),
    });
  } else {
    saveGame(game);
    const gameCopy = { ...game, subStatus: "playerJoin" as const };
    ctx.send({
      type: "game.state",
      payload: onOkSocketResponse(gameCopy, "Waiting for opponent to ready"),
    });
  }
}
