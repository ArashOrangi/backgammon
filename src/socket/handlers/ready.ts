import { getGame, saveGame } from "../../game/gameStore";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import { appendGameEvent, loadGameState } from "@/game/eventStore";
import { createInitialBoard } from "@/game/board";
import { rollDie } from "@/utils/dice";

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
  }

  // اگر هر دو بازیکن آماده شدند → شروع خودکار بازی
  if (game.readyPlayers.length === 2) {
    const whitePlayer = game.players.find((p) => p.color === "white")!;
    const blackPlayer = game.players.find((p) => p.color === "black")!;

    // ۱. ریختن تاس شروع برای هر بازیکن (بدون ذخیره در game.dice)
    const whiteDie = rollDie();
    const blackDie = rollDie();

    // ===== ارسال تاس‌های شروع به هر دو کلاینت =====
    rooms.broadcast(gameId, {
      type: "dice.result",
      payload: {
        dice: [whiteDie, blackDie], // ایندکس 0 = سفید، ایندکس 1 = سیاه
        playerId: 0, // placeholder (هیچ بازیکنی با id=0 وجود ندارد)
        type: "starting", // کلاینت می‌فهمد که این تاس شروع است
      },
    });

    // ثبت ایونت‌های STARTING_ROLLED
    await appendGameEvent(gameId, {
      type: "STARTING_ROLLED",
      payload: { playerId: whitePlayer.id, value: whiteDie },
    });
    await appendGameEvent(gameId, {
      type: "STARTING_ROLLED",
      payload: { playerId: blackPlayer.id, value: blackDie },
    });

    // ۲. تعیین بازیکن شروع‌کننده (در صورت تساوی، سفید شروع می‌کند)
    let startingPlayerId = whitePlayer.id;
    if (whiteDie !== blackDie) {
      startingPlayerId = whiteDie > blackDie ? whitePlayer.id : blackPlayer.id;
    }

    // ۳. ساخت تخته اولیه
    game.board = createInitialBoard(whitePlayer.id, blackPlayer.id);

    // ۴. ثبت ایونت GAME_STARTED
    await appendGameEvent(gameId, {
      type: "GAME_STARTED",
      payload: {
        whitePlayerId: whitePlayer.id,
        blackPlayerId: blackPlayer.id,
        startingPlayerId,
      },
    });

    // ۵. به‌روزرسانی وضعیت بازی در حافظه
    game.status = "in-progress";
    game.turn = startingPlayerId;
    game.dice = []; // تاس شروع فقط برای تعیین نوبت بود، نوبت اول باید دوباره ریخته شود
    game.turnStartedAt = Date.now();
    game.lastActionAt = Date.now();
    delete game.readyPlayers;

    saveGame(game);

    // ۶. بارگذاری مجدد وضعیت از eventStore (برای هماهنگی کامل)
    const finalGame = await loadGameState(gameId);
    if (finalGame) {
      // برودکست وضعیت کامل بازی به هر دو بازیکن
      rooms.broadcast(gameId, {
        type: "game.state",
        payload: onOkSocketResponse(finalGame, "Game started automatically"),
      });

      // ارسال پیام نوبت بازیکن شروع‌کننده
      rooms.broadcast(gameId, {
        type: "game.turn",
        payload: {
          playerId: startingPlayerId,
          color: startingPlayerId === whitePlayer.id ? "white" : "black",
        },
      });
    }
  } else {
    saveGame(game);
    const gameCopy = { ...game, subStatus: "playerJoin" as const };
    ctx.send({
      type: "game.state",
      payload: onOkSocketResponse(gameCopy, "Waiting for opponent to ready"),
    });
  }
}
