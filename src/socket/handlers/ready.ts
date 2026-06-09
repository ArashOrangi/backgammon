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
import { runBotIfNeeded } from "@/game/botRunner"; // اضافه شده

// ذخیره وضعیت آمادگی هر بازی (در حافظه، نه در state بازی)
const readyStates = new Map<number, Set<number>>();

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

  // ۱. بارگذاری آخرین وضعیت از دیتابیس (event sourcing)
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

  // اگر بازی قبلاً شروع شده باشد، اجازه آماده شدن مجدد ندهید
  if (game.status === "in-progress") {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Game already started"),
    });
  }

  // مطمئن شوید هر دو بازیکن حضور دارند (حداقل ۲ نفر)
  if (game.players.length < 2) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not enough players to start"),
    });
  }

  // ۲. ثبت آمادگی در حافظه موقت
  if (!readyStates.has(gameId)) {
    readyStates.set(gameId, new Set());
  }
  const readySet = readyStates.get(gameId)!;
  if (!readySet.has(userId)) {
    readySet.add(userId);
  }

  // ۳. اگر هر دو آماده شدند → شروع بازی
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

    // بارگذاری مجدد وضعیت جدید
    const freshGame = await loadGameState(gameId);
    if (!freshGame) throw new Error("Failed to reload game after start");

    // پاک کردن وضعیت آمادگی این بازی از حافظه موقت
    readyStates.delete(gameId);

    // ذخیره در حافظه سرور
    saveGame(freshGame);

    const subStatus = calculateSubStatus(freshGame);
    const legalMoves = freshGame.turn
      ? generateMoveSequences(freshGame, freshGame.turn)
      : [];
    const flatLegalMoves = flattenMoveSequences(legalMoves);
    const stateToSend: any = { ...freshGame, legalMoves: flatLegalMoves };
    if (subStatus === "playDice") {
      stateToSend.subStatus = "playDice";
    }

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

    // ========== اضافه شده: اجرای بات در صورت نیاز ==========
    if (freshGame.status === "in-progress") {
      // همواره نوبت فعلی را به بات رانر بده (خودش بررسی می‌کند که آیا آن بازیکن بات است)
      await runBotIfNeeded(gameId, freshGame.turn!, rooms);
    }
    // ====================================================
  } else {
    // هنوز هر دو آماده نشده‌اند: فقط به همین کلاینت وضعیت فعلی را بفرست
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
