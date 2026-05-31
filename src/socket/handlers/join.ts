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
import { loadGameState, appendGameEvent } from "@/game/eventStore";
import { prismaGameCreate } from "@/models/game";
import { prisma } from "@/components/prisma";
import { OrmState } from "@/models/enums";
import { BotPlayer } from "@/bot/botPlayer";

type JoinPayload = { gameId: number; userId: number };

// صف سوکت‌های منتظر
const waitingSockets = new Map<number, SocketContext>();
// تایمرهای مربوط به هر کاربر در صف (برای ساخت بات)
const waitingTimers = new Map<number, NodeJS.Timeout>();
// شناسه بات (حتماً باید در دیتابیس وجود داشته باشد)
const BOT_ID = Number(process.env.BOT_USER_ID) || 999999;

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
        const waitingGame = createInitialGameState(-1);
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
            const gameIdForBot = await createGameWithBot(userId, BOT_ID);
            if (!gameIdForBot) {
              console.error(`Failed to create bot game for user ${userId}`);
              return;
            }

            // بارگذاری وضعیت بازی
            const game = await loadGameState(gameIdForBot);
            if (!game) return;

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
            await addBotToGame(gameIdForBot, BOT_ID, rooms);
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
      game = createInitialGameState(gameId);
      saveGame(game);
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
  if (!game || game === OrmState.Error) return null;
  await prisma.games.update({
    where: { id: game.id },
    data: { blackPlayerId: botId },
  });
  await appendGameEvent(game.id, {
    type: "PLAYER_JOINED",
    payload: { playerId: whiteId, color: "white" },
  });
  await appendGameEvent(game.id, {
    type: "PLAYER_JOINED",
    payload: { playerId: botId, color: "black" },
  });
  return game.id;
}

async function addBotToGame(gameId: number, botId: number, rooms: RoomManager) {
  // یک SocketContext ساختگی برای بات بسازید (فقط برای عضویت در اتاق و فراخوانی هندلرها)
  const fakeCtx = {
    id: `bot-${botId}`,
    userId: botId,
    send: () => {},
    ws: { readyState: 1, send: () => {} },
  } as any;
  // بات را به اتاق اضافه کنید
  rooms.join(gameId, fakeCtx, "player");
  // ارسال player.ready توسط بات
  const { handleReady } = await import("./ready");
  await handleReady(fakeCtx, { gameId }, rooms);
  // شروع حلقه بات
  const bot = new BotPlayer(botId, gameId, rooms);
  bot.start();
}
