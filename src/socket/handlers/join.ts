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
import { addToMatchmaking } from "@/models/matchmaking"; // فرض می‌کنیم این فایل ساخته شده
import { loadGameState } from "@/game/eventStore";

type JoinPayload = { gameId: number; userId: number };

export async function handleJoin(
  ctx: SocketContext,
  payload: JoinPayload,
  rooms: RoomManager,
) {
  let { gameId, userId } = payload;
  ctx.userId = userId;
  // TODO: مچ‌میکینگ موقت برای دولوپ، بعداً حذف میشه
  try {
    // ---------- حالت مچ‌میکینگ (خودکار) ----------
    // در بالای فایل join.ts، خارج از تابع handleJoin
    const waitingSockets = new Map<number, SocketContext>();

    // داخل handleJoin، در حالت gameId === -1
    if (gameId === -1) {
      // اگر کاربر قبلاً در صف است؟ (احتمال درخواست تکراری)
      if (waitingSockets.has(userId)) {
        return ctx.send({
          type: "game.error",
          payload: onErrorSocketResponse("Already in matchmaking queue"),
        });
      }

      const matchedGameId = await addToMatchmaking(userId);
      if (matchedGameId === 0) {
        // در صف قرار می‌گیرد
        waitingSockets.set(userId, ctx);
        const waitingGame = createInitialGameState(-1);
        waitingGame.status = "waiting";
        waitingGame.subStatus = "playerJoin";
        waitingGame.players = [{ id: userId, color: "white" }];
        return ctx.send({
          type: "game.state",
          payload: onOkSocketResponse(waitingGame, "Waiting for opponent"),
        } as any);
      } else {
        // جفت شد: بازی با gameId = matchedGameId ساخته شده است
        // بارگذاری وضعیت بازی از دیتابیس
        const game = await loadGameState(matchedGameId);
        if (!game) {
          return ctx.send({
            type: "game.error",
            payload: onErrorSocketResponse("Game not found after matchmaking"),
          });
        }

        // اضافه کردن هر دو بازیکن به اتاق
        rooms.join(matchedGameId, ctx, "player");
        // پیدا کردن سوکت بازیکن اول (که در صف انتظار است)
        const firstPlayerId = game.players.find((p) => p.id !== userId)?.id;
        if (firstPlayerId && waitingSockets.has(firstPlayerId)) {
          const firstSocket = waitingSockets.get(firstPlayerId)!;
          rooms.join(matchedGameId, firstSocket, "player");
          waitingSockets.delete(firstPlayerId);
          // ارسال وضعیت ready به بازیکن اول
          firstSocket.send({
            type: "game.state",
            payload: onOkSocketResponse(game, "Both players joined, ready"),
          });
        }

        // تنظیم وضعیت بازی در حافظه
        if (game.status === "waiting") {
          game.status = "ready";
          game.subStatus = "gameReady";
          saveGame(game);
        }

        // ارسال وضعیت به بازیکن دوم (فعلی)
        ctx.send({
          type: "game.state",
          payload: onOkSocketResponse(game, "Both players joined, ready"),
        });

        // برودکست به همه (برای اطمینان، اگر کسی دیگر نباشد)
        rooms.broadcast(matchedGameId, {
          type: "game.state",
          payload: onOkSocketResponse(game, "Both players joined, ready"),
        });

        return; // پایان کار
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
        // اولین بازیکن: فقط تأیید (بدون data)

        const waiter = {
          status: "waiting",
          subStatus: "playerJoin",
          players: [{ id: userId, color: "white" }],
        };
        return ctx.send({
          type: "game.state",
          payload: onOkSocketResponse(waiter, "Waiting for opponent"),
        } as any);
      } else if (game.players.length === 2) {
        // دومین بازیکن: بازی آماده است، وضعیت کامل را به همه بفرست
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
      // بازیکن قبلاً در بازی بوده (reconnect) – وضعیت کامل را فقط برای خودش بفرست
      ctx.send({
        type: "game.state",
        payload: onOkSocketResponse(game, "Rejoined"),
      });
    }

    // همیشه بازیکن را به اتاق اضافه کن (برای دریافت پیام‌های گروهی بعدی)
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
