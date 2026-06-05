import {
  getGame,
  saveGame,
  createInitialGameState,
} from "../../game/gameStore";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import { addToMatchmaking } from "@/models/matchmaking";
import {
  loadGameState,
  appendGameEvent,
  forceSnapshot,
} from "@/game/eventStore";
import { prismaGameCreate } from "@/models/game";
import { prisma } from "@/components/prisma";
import { OrmState } from "@/models/enums";
import { BotPlayer } from "@/bot/botPlayer";
import { getDefaultTimerPreset } from "@/models/timerPreset";
import { GameState } from "@/game/types";

type JoinPayload = { gameId: number; userId: number };

// صف سوکت‌های منتظر
const waitingSockets = new Map<number, SocketContext>();
// تایمرهای مربوط به هر کاربر در صف (برای ساخت بات)
const waitingTimers = new Map<number, NodeJS.Timeout>();

// تابع کمکی برای اعمال تنظیمات تایمر از دیتابیس و ذخیره snapshot جدید
async function applyTimerSettingsToGame(game: GameState) {
  const preset = await getDefaultTimerPreset();
  let needUpdate = false;

  if (game.primaryTimePerTurn === 12 || game.primaryTimePerTurn === 0) {
    game.primaryTimePerTurn = preset.primarySeconds;
    needUpdate = true;
  }

  if (!game.secondaryTimeBank) game.secondaryTimeBank = {};
  for (const p of game.players) {
    if (game.secondaryTimeBank[p.id] === undefined) {
      game.secondaryTimeBank[p.id] = preset.secondarySeconds;
      needUpdate = true;
    }
  }

  if (needUpdate) {
    saveGame(game);
    await forceSnapshot(game.id, game);
  }
}

// شناسه بات (حتماً باید در دیتابیس وجود داشته باشد)
function getBotId(): number {
  const id = Number(process.env.BOT_USER_ID);
  return isNaN(id) || id === 0 ? 999999 : id;
}

export async function handleJoin(
  ctx: SocketContext,
  payload: JoinPayload,
  rooms: RoomManager,
) {
  let { gameId, userId } = payload;
  ctx.userId = userId;

  try {
    // ---------- حالت مچ‌میکینگ (خودکار) ----------
    if (gameId === -1) {
      // جلوگیری از درخواست تکراری
      if (waitingSockets.has(userId)) {
        return ctx.send({
          type: "game.error",
          payload: onErrorSocketResponse("Already in queue"),
        });
      }

      const matchedGameId = await addToMatchmaking(userId);
      if (matchedGameId === 0) {
        // ---------- وارد صف شد ----------
        waitingSockets.set(userId, ctx);
        const waitingGame = await createInitialGameState(-1);
        waitingGame.status = "waiting";
        waitingGame.subStatus = "playerJoin";
        waitingGame.players = [{ id: userId, color: "white" }];
        ctx.send({
          type: "game.state",
          payload: onOkSocketResponse(waitingGame, "Waiting for opponent"),
        });

        // تنظیم تایمر ۱۰ ثانیه برای ساخت بات
        const timer = setTimeout(async () => {
          // اگر کاربر هنوز در صف است (حریف انسانی نیامده)
          if (waitingSockets.has(userId)) {
            waitingSockets.delete(userId);
            waitingTimers.delete(userId);

            // ساخت بازی با بات
            const gameIdForBot = await createGameWithBot(userId, getBotId());
            if (!gameIdForBot) {
              console.error(`Failed to create bot game for user ${userId}`);
              return;
            }

            // بارگذاری وضعیت بازی
            const game = await loadGameState(gameIdForBot);
            if (!game) return;

            // اعمال تنظیمات تایمر و ذخیره snapshot جدید
            await applyTimerSettingsToGame(game);

            // اضافه کردن کاربر انسانی به اتاق
            rooms.join(gameIdForBot, ctx, "player");
            game.status = "ready";
            game.subStatus = "gameReady";
            saveGame(game);

            // ارسال وضعیت به کاربر انسانی
            ctx.send({
              type: "game.state",
              payload: onOkSocketResponse(game, "Bot joined as opponent"),
            });

            // اضافه کردن بات به اتاق و شروع آن
            await addBotToGame(gameIdForBot, getBotId(), rooms);
          }
        }, 10000); // ۱۰ ثانیه

        waitingTimers.set(userId, timer);
        return;
      } else {
        // ---------- جفت شدن با یک بازیکن انسانی دیگر ----------
        const game = await loadGameState(matchedGameId);
        if (!game) {
          return ctx.send({
            type: "game.error",
            payload: onErrorSocketResponse("Game not found"),
          });
        }

        // اعمال تنظیمات تایمر و ذخیره snapshot جدید
        await applyTimerSettingsToGame(game);

        // لغو تایمر کاربر اول (اگر وجود داشته باشد)
        const players = game.players;
        for (const p of players) {
          const timer = waitingTimers.get(p.id);
          if (timer) {
            clearTimeout(timer);
            waitingTimers.delete(p.id);
          }
          const socket = waitingSockets.get(p.id);
          if (socket) {
            rooms.join(matchedGameId, socket, "player");
            waitingSockets.delete(p.id);
          }
        }
        // کاربر فعلی (دومین بازیکن) را نیز اضافه کنید
        rooms.join(matchedGameId, ctx, "player");

        game.status = "ready";
        game.subStatus = "gameReady";
        saveGame(game);

        rooms.broadcast(matchedGameId, {
          type: "game.state",
          payload: onOkSocketResponse(game, "Both players joined, ready"),
        });
        return;
      }
    }

    // ---------- حالت عادی (با gameId مشخص) ----------
    let game = getGame(gameId);
    if (!game) {
      game = await createInitialGameState(gameId);
      saveGame(game);
      // بازی تازه ساخته شده، تنظیمات تایمر را از دیتابیس اعمال کن
      await applyTimerSettingsToGame(game);
    } else {
      // حتی اگر بازی وجود دارد، مطمئن شو تایمرها تنظیم شده‌اند
      await applyTimerSettingsToGame(game);
    }

    const alreadyInGame = game.players.find((p) => p.id === userId);
    if (!alreadyInGame) {
      if (game.players.length >= 2) {
        return ctx.send({
          type: "game.error",
          payload: onErrorSocketResponse("Game is full"),
        });
      }

      const color = game.players.length === 0 ? "white" : "black";
      game.players.push({ id: userId, color });
      saveGame(game);

      if (game.players.length === 1) {
        // اولین بازیکن: وضعیت waiting با subStatus playerJoin
        game.subStatus = "playerJoin";
        saveGame(game);
        return ctx.send({
          type: "game.state",
          payload: onOkSocketResponse(game, "Waiting for opponent"),
        });
      } else if (game.players.length === 2) {
        // دومین بازیکن: بازی آماده است
        rooms.join(gameId, ctx, "player");
        game.status = "ready";
        game.subStatus = "gameReady";
        game.turn = null;
        saveGame(game);
        rooms.broadcast(gameId, {
          type: "game.state",
          payload: onOkSocketResponse(game, "Both players joined, ready"),
        });
      }
    } else {
      ctx.send({
        type: "game.state",
        payload: onOkSocketResponse(game, "Rejoined"),
      });
    }

    rooms.join(gameId, ctx, "player");
  } catch (err) {
    console.error("Join Error:", err);
    ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(
        err instanceof Error ? err.message : "Join failed",
      ),
    });
  }
}

// --------------------- توابع کمکی برای ساخت بازی با بات ---------------------

async function createGameWithBot(
  whiteId: number,
  botId: number,
): Promise<number | null> {
  const game = await prismaGameCreate(whiteId);
  if (!game || game === OrmState.Error) {
    console.error(
      `[createGameWithBot] prismaGameCreate failed for whiteId=${whiteId}`,
    );
    return null;
  }
  console.log(`[createGameWithBot] game created with id=${game.id}`);

  await prisma.games.update({
    where: { id: game.id },
    data: { blackPlayerId: botId },
  });
  console.log(`[createGameWithBot] updated game with blackPlayerId=${botId}`);

  await appendGameEvent(game.id, {
    type: "PLAYER_JOINED",
    payload: { playerId: whiteId, color: "white" },
  });
  await appendGameEvent(game.id, {
    type: "PLAYER_JOINED",
    payload: { playerId: botId, color: "black" },
  });

  // بعد از ثبت ایونت‌ها، تایمرها را از دیتابیس اعمال کن و snapshot را به‌روز کن
  const state = await loadGameState(game.id);
  if (state) {
    await applyTimerSettingsToGame(state);
  }

  return game.id;
}

async function addBotToGame(gameId: number, botId: number, rooms: RoomManager) {
  const fakeCtx = {
    id: `bot-${botId}`,
    userId: botId,
    send: () => {},
    ws: { readyState: 1, send: () => {} },
  } as any;
  rooms.join(gameId, fakeCtx, "player");
  const { handleReady } = await import("./ready");
  await handleReady(fakeCtx, { gameId }, rooms);
  // قبل از شروع بات، یک تأخیر کوتاه بدهید تا state به‌روز شود
  setTimeout(() => {
    const bot = new BotPlayer(botId, gameId, rooms);
    bot.start();
  }, 500);
}
