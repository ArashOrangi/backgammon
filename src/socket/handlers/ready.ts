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

  // ۱. بارگذاری وضعیت واقعی از دیتابیس (event sourcing)
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

  if (game.status !== "ready") {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Game is not in ready state"),
    });
  }

  // ۲. مدیریت آمادگی بازیکنان (با استفاده از حافظه موقت، چون این وضعیت در ایونت‌ها ذخیره نمی‌شود)
  let memoryGame = getGame(gameId);
  if (!memoryGame) {
    memoryGame = game;
    saveGame(memoryGame);
  }
  if (!memoryGame.readyPlayers) memoryGame.readyPlayers = [];
  if (!memoryGame.readyPlayers.includes(userId)) {
    memoryGame.readyPlayers.push(userId);
    saveGame(memoryGame);
  }

  // ۳. اگر هر دو بازیکن آماده شدند
  if (memoryGame.readyPlayers.length === 2) {
    const whitePlayer = game.players.find((p) => p.color === "white")!;
    const blackPlayer = game.players.find((p) => p.color === "black")!;

    let whiteDie: number, blackDie: number;
    let attempts = 0;
    do {
      whiteDie = rollDie();
      blackDie = rollDie();
      attempts++;

      // ثبت تلاش‌های تاس شروع
      await appendGameEvent(gameId, {
        type: "STARTING_ROLLED",
        payload: { playerId: whitePlayer.id, value: whiteDie },
      });
      await appendGameEvent(gameId, {
        type: "STARTING_ROLLED",
        payload: { playerId: blackPlayer.id, value: blackDie },
      });
    } while (whiteDie === blackDie && attempts < 10);

    // ارسال تاس‌های شروع به کلاینت‌ها (جهت نمایش)
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

    // ۴. ثبت رویداد شروع بازی
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

    // ۵. بازسازی وضعیت نهایی از روی ایونت‌ها (حتماً بعد از ثبت GAME_STARTED)
    const freshGame = await loadGameState(gameId);
    if (!freshGame) {
      throw new Error("Failed to reload game after start");
    }

    // ۶. جایگزینی حافظه موقت با وضعیت جدید
    saveGame(freshGame);
    // پاک کردن readyPlayers (دیگر نیازی نیست)
    delete freshGame.readyPlayers;

    // ۷. محاسبه وضعیت فرعی و حرکات قانونی
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

    // ۸. ارسال وضعیت کامل و نوبت به همه
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
  } else {
    // هنوز هر دو آماده نشده‌اند
    const stateToSend = {
      ...memoryGame,
      subStatus: "playerJoin" as const,
    };
    ctx.send({
      type: "game.state",
      payload: onOkSocketResponse(stateToSend, "Waiting for opponent to ready"),
    });
  }
}
