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
import { addToMatchmaking, removeFromMatchmaking } from "@/models/matchmaking";
import { loadGameState, forceSnapshot } from "@/game/eventStore";
import { prisma } from "@/components/prisma";
import { getDefaultTimerPreset } from "@/models/timerPreset";
import { GameState } from "@/game/types";
import { RoomType } from "@prisma/client";
import { markBotReady } from "./ready";
import { BOT_USER_ID } from "@/static/statics";

type JoinPayload = { gameId: number; userId: number; roomType?: RoomType };

// ======================================================
// مدیریت صف کاربران در حال انتظار
// ======================================================
const waitingSockets = new Map<number, SocketContext>();
const pendingUsers = new Set<number>();

/**
 * تنظیم تایمرهای پیش‌فرض برای بازی (در صورت نیاز)
 */
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

/**
 * ارسال پیام به کاربر در حال انتظار که بازی آماده است
 * این تابع از matchmaking.ts صدا زده می‌شود
 */
export async function notifyUserGameReady(
  userId: number,
  gameId: number,
  rooms: RoomManager,
) {
  const ctx = waitingSockets.get(userId);
  if (!ctx) return;

  // بررسی اینکه socket هنوز باز است
  if (ctx.ws.readyState !== ctx.ws.OPEN) {
    console.log(
      `[notifyUserGameReady] Socket for user ${userId} is closed, removing from queue`,
    );
    waitingSockets.delete(userId);
    pendingUsers.delete(userId);
    return;
  }

  waitingSockets.delete(userId);
  pendingUsers.delete(userId);

  const game = await loadGameState(gameId);
  if (!game) {
    ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Game not found"),
    });
    return;
  }

  // تنظیم وضعیت بازی به ready
  if (game.status !== "ready" && game.status !== "in-progress") {
    game.status = "ready";
    game.subStatus = "gameReady";
    game.turn = null;
    saveGame(game);
    await forceSnapshot(game.id, game);
    console.log(`[notifyUserGameReady] Game ${gameId} status set to ready`);
  }

  // ===== علامت‌گذاری بات به عنوان آماده (اگر در بازی باشد) =====
  const hasBot = game.players.some((p) => p.id === BOT_USER_ID);
  if (hasBot) {
    markBotReady(gameId, BOT_USER_ID);
    console.log(`[notifyUserGameReady] Bot marked ready for game ${gameId}`);
  }
  // ===========================================================

  // کاربر را به اتاق اضافه کن
  try {
    rooms.join(gameId, ctx, "player");
    console.log(`[notifyUserGameReady] User ${userId} joined room ${gameId}`);
  } catch (err) {
    console.error(
      `[notifyUserGameReady] Failed to join room for user ${userId}:`,
      err,
    );
  }

  // ارسال پیام مستقیم به کاربر اول
  ctx.send({
    type: "game.state",
    payload: onOkSocketResponse(game, "Opponent found! Game is ready."),
  });
}

/**
 * هندلر اصلی Join
 */
export async function handleJoin(
  ctx: SocketContext,
  payload: JoinPayload,
  rooms: RoomManager,
) {
  let { gameId, userId, roomType } = payload;
  ctx.userId = userId;

  try {
    // ---------- حالت مچ‌میکینگ (خودکار) ----------
    if (gameId === -1) {
      // ✅ بررسی اینکه کاربر قبلاً در یک بازی فعال نیست
      const existingGame = await prisma.games.findFirst({
        where: {
          OR: [
            { whitePlayerId: userId, status: { in: ["PENDING", "ACTIVE"] } },
            { blackPlayerId: userId, status: { in: ["PENDING", "ACTIVE"] } },
          ],
        },
      });

      if (existingGame) {
        const game = await loadGameState(existingGame.id);
        if (game) {
          rooms.join(existingGame.id, ctx, "player");
          return ctx.send({
            type: "game.state",
            payload: onOkSocketResponse(game, "Already in a game"),
          });
        }
      }

      // ✅ به‌روزرسانی: اگر کاربر در صف است، socket را جایگزین کن
      if (waitingSockets.has(userId) || pendingUsers.has(userId)) {
        const oldCtx = waitingSockets.get(userId);
        if (oldCtx && oldCtx.ws.readyState !== oldCtx.ws.OPEN) {
          // socket قدیمی بسته است → آن را حذف کن
          waitingSockets.delete(userId);
          pendingUsers.delete(userId);
          console.log(`[Join] Removed stale socket for user ${userId}`);
        } else {
          // socket باز است → آن را به‌روزرسانی کن (جایگزین کن)
          waitingSockets.set(userId, ctx);
          pendingUsers.add(userId);
          console.log(`[Join] Updated socket for user ${userId} in queue`);

          // ارسال وضعیت منتظر به کاربر
          const waitingGame = await createInitialGameState(-1);
          waitingGame.status = "waiting";
          waitingGame.subStatus = "playerJoin";
          waitingGame.players = [{ id: userId, color: "white" }];
          return ctx.send({
            type: "game.state",
            payload: onOkSocketResponse(
              waitingGame,
              "Already in queue, socket updated",
            ),
          });
        }
      }

      // ۲. تلاش برای پیدا کردن حریف (همگام) - rooms را هم پاس می‌دهیم
      const matchedGameId = await addToMatchmaking(
        userId,
        roomType || RoomType.CASUAL_1,
        rooms,
      );

      if (matchedGameId === 0) {
        // ---------- در صف قرار گرفت ----------
        pendingUsers.add(userId);
        waitingSockets.set(userId, ctx);

        // ارسال وضعیت منتظر به کاربر
        const waitingGame = await createInitialGameState(-1);
        waitingGame.status = "waiting";
        waitingGame.subStatus = "playerJoin";
        waitingGame.players = [{ id: userId, color: "white" }];
        return ctx.send({
          type: "game.state",
          payload: onOkSocketResponse(waitingGame, "Waiting for opponent"),
        });
      } else {
        // ---------- حریف پیدا شد (انسانی یا بات) ----------
        pendingUsers.delete(userId);
        waitingSockets.delete(userId);

        // ۱. کاربر اول (نفر قبل) را پیدا کن و به اتاق اضافه کن
        const game = await loadGameState(matchedGameId);
        if (!game) {
          return ctx.send({
            type: "game.error",
            payload: onErrorSocketResponse("Game not found after matchmaking"),
          });
        }

        const otherPlayer = game.players.find((p) => p.id !== userId);
        if (otherPlayer) {
          const firstPlayerCtx = waitingSockets.get(otherPlayer.id);
          if (
            firstPlayerCtx &&
            firstPlayerCtx.ws.readyState === firstPlayerCtx.ws.OPEN
          ) {
            try {
              rooms.join(matchedGameId, firstPlayerCtx, "player");
              console.log(
                `[Join] First player ${otherPlayer.id} joined room ${matchedGameId}`,
              );
            } catch (err) {
              console.error(`[Join] Failed to join first player:`, err);
            }
            waitingSockets.delete(otherPlayer.id);
            pendingUsers.delete(otherPlayer.id);
          }
        }

        // ۲. کاربر فعلی (نفر دوم) را به اتاق اضافه کن
        try {
          rooms.join(matchedGameId, ctx, "player");
          console.log(
            `[Join] User ${userId} (second) joined room ${matchedGameId}`,
          );
        } catch (err) {
          console.error(`[Join] Failed to join second player:`, err);
        }

        // ۳. بارگذاری مجدد بازی (احتمالاً تغییر کرده)
        const freshGame = await loadGameState(matchedGameId);
        if (!freshGame) {
          return ctx.send({
            type: "game.error",
            payload: onErrorSocketResponse("Game not found after joining"),
          });
        }

        // بررسی سلامت بازی
        if (freshGame.players.length !== 2) {
          console.error(
            `[Join] Game ${matchedGameId} has ${freshGame.players.length} players, expected 2`,
          );
          return ctx.send({
            type: "game.error",
            payload: onErrorSocketResponse("Invalid game state"),
          });
        }
        if (freshGame.players[0].id === freshGame.players[1].id) {
          console.error(`[Join] Duplicate players in game ${matchedGameId}`);
          return ctx.send({
            type: "game.error",
            payload: onErrorSocketResponse("Invalid game state"),
          });
        }

        // تنظیم تایمر
        await applyTimerSettingsToGame(freshGame);

        // وضعیت بازی را ready کن
        if (freshGame.status !== "ready") {
          freshGame.status = "ready";
          freshGame.subStatus = "gameReady";
          freshGame.turn = null;
          saveGame(freshGame);
          await forceSnapshot(freshGame.id, freshGame);
        }

        // ===== اگر حریف بات است، آن را به عنوان آماده علامت‌گذاری کن =====
        const hasBot = freshGame.players.some((p) => p.id === BOT_USER_ID);
        if (hasBot) {
          markBotReady(matchedGameId, BOT_USER_ID);
          console.log(
            `[handleJoin] Bot marked ready for game ${matchedGameId}`,
          );
        }
        // ===========================================================

        // ✅ فقط یک بار Broadcast (به جای ارسال مستقیم)
        rooms.broadcast(matchedGameId, {
          type: "game.state",
          payload: onOkSocketResponse(freshGame, "Both players joined, ready"),
        });

        return;
      }
    }

    // ---------- حالت عادی (با gameId مشخص) ----------
    let game = getGame(gameId);
    if (!game) {
      game = await createInitialGameState(gameId);
      game.roomType = roomType || RoomType.CASUAL_1;
      game.doublingCubeEnabled = game.roomType !== RoomType.CASUAL_1;
      saveGame(game);
      await applyTimerSettingsToGame(game);
    } else {
      if (roomType && !game.roomType) {
        game.roomType = roomType;
        game.doublingCubeEnabled = true;
        saveGame(game);
      }
      await applyTimerSettingsToGame(game);
    }

    // بررسی یکسان نبودن بازیکنان (امنیت)
    if (
      game.players.length === 2 &&
      game.players[0].id === game.players[1].id
    ) {
      console.error(
        `[Join] Game ${gameId} has duplicate players. Resetting...`,
      );
      game = await createInitialGameState(gameId);
      game.players = [];
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
        game.subStatus = "playerJoin";
        saveGame(game);
        rooms.join(gameId, ctx, "player");
        return ctx.send({
          type: "game.state",
          payload: onOkSocketResponse(game, "Waiting for opponent"),
        });
      } else if (game.players.length === 2) {
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
      // کاربر قبلاً در بازی است – فقط وضعیت را برایش بفرست
      rooms.join(gameId, ctx, "player");
      ctx.send({
        type: "game.state",
        payload: onOkSocketResponse(game, "Rejoined"),
      });
    }
  } catch (err) {
    console.error("Join Error:", err);
    // در صورت خطا، کاربر را از صف حذف کن
    waitingSockets.delete(userId);
    pendingUsers.delete(userId);
    ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(
        err instanceof Error ? err.message : "Join failed",
      ),
    });
  }
}

/**
 * تابع پاک کردن کاربر از صف (در صورت خروج یا قطع اتصال)
 */
export function clearWaitingUser(userId: number) {
  waitingSockets.delete(userId);
  pendingUsers.delete(userId);
  removeFromMatchmaking(userId);
}
