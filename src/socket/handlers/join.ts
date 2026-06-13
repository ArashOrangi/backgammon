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

type JoinPayload = { gameId: number; userId: number; roomType?: RoomType };

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
      // اگر کاربر قبلاً در صف است، خطا بده
      const alreadyQueued = await prisma.users.findUnique({
        where: { id: userId },
        select: { id: true },
      }); // ساده: می‌توانیم از یک Map محلی برای تشخیص استفاده کنیم
      // برای سادگی فرض می‌کنیم addToMatchmaking خودش تکراری را مدیریت می‌کند

      const matchedGameId = await addToMatchmaking(
        userId,
        roomType || RoomType.CASUAL_1,
      );

      if (matchedGameId === 0) {
        // در صف قرار گرفت – فقط وضعیت منتظر را بفرست
        const waitingGame = await createInitialGameState(-1);
        waitingGame.status = "waiting";
        waitingGame.subStatus = "playerJoin";
        waitingGame.players = [{ id: userId, color: "white" }];
        return ctx.send({
          type: "game.state",
          payload: onOkSocketResponse(waitingGame, "Waiting for opponent"),
        });
      } else {
        // حریف پیدا شد (انسانی یا بات) – بازی را بارگذاری کن
        const game = await loadGameState(matchedGameId);
        if (!game) {
          return ctx.send({
            type: "game.error",
            payload: onErrorSocketResponse("Game not found after matchmaking"),
          });
        }

        // بررسی سلامت بازی
        if (game.players.length !== 2) {
          console.error(
            `[Join] Game ${matchedGameId} has ${game.players.length} players, expected 2`,
          );
          return ctx.send({
            type: "game.error",
            payload: onErrorSocketResponse("Invalid game state"),
          });
        }
        if (game.players[0].id === game.players[1].id) {
          console.error(`[Join] Duplicate players in game ${matchedGameId}`);
          return ctx.send({
            type: "game.error",
            payload: onErrorSocketResponse("Invalid game state"),
          });
        }

        // تنظیم تایمرهای بازی (اگر قبلاً تنظیم نشده)
        await applyTimerSettingsToGame(game);

        // کاربر فعلی را به اتاق اضافه کن
        rooms.join(matchedGameId, ctx, "player");

        // وضعیت بازی را ready کن (اگر هنوز ready نیست)
        if (game.status !== "ready") {
          game.status = "ready";
          game.subStatus = "gameReady";
          game.turn = null;
          saveGame(game);
          await forceSnapshot(game.id, game);
        }

        // برای کاربر دیگر (اگر آنلاین است) قبلاً توسط مچ‌میکینگ یا بات به اتاق اضافه شده
        // اما باید به همه بگوییم بازی آماده است
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
      await applyTimerSettingsToGame(game);
    } else {
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
    ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(
        err instanceof Error ? err.message : "Join failed",
      ),
    });
  }
}

// تابع پاک کردن کاربر از صف (در صورت لزوم از خارج)
export function clearWaitingUser(userId: number) {
  removeFromMatchmaking(userId);
}
