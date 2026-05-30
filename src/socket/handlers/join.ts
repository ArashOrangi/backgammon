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
const waitingSockets = new Map<number, SocketContext>();

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
    // خارج از تابع handleJoin، یک Map برای نگهداری سوکت کاربران در صف
    // خارج از تابع handleJoin، یک Map برای نگهداری سوکت کاربران در صف

    // داخل handleJoin، بخش gameId === -1
    if (gameId === -1) {
      // اگر کاربر قبلاً در صف است
      if (waitingSockets.has(userId)) {
        return ctx.send({
          type: "game.error",
          payload: onErrorSocketResponse("Already in queue"),
        });
      }

      const matchedGameId = await addToMatchmaking(userId);
      if (matchedGameId === 0) {
        // وارد صف شد
        waitingSockets.set(userId, ctx);
        const waitingGame = createInitialGameState(-1);
        waitingGame.status = "waiting";
        waitingGame.subStatus = "playerJoin";
        waitingGame.players = [{ id: userId, color: "white" }];
        return ctx.send({
          type: "game.state",
          payload: onOkSocketResponse(waitingGame, "Waiting for opponent"),
        });
      } else {
        // جفت شد: بازی با matchedGameId ساخته شده و ایونت‌ها ثبت شده‌اند
        const game = await loadGameState(matchedGameId);
        if (!game) {
          return ctx.send({
            type: "game.error",
            payload: onErrorSocketResponse("Game not found"),
          });
        }

        // هر دو بازیکن را به اتاق اضافه کن
        const players = game.players; // حالا پر است
        console.log({ players, len: players.length });

        for (const p of players) {
          console.log({ p });

          const socket = waitingSockets.get(p.id);
          if (socket) {
            rooms.join(matchedGameId, socket, "player");
            waitingSockets.delete(p.id);
          }
        }
        // خود این سوکت (دومین بازیکن) را هم اضافه کن
        rooms.join(matchedGameId, ctx, "player");

        // وضعیت بازی را به ready تغییر بده
        game.status = "ready";
        game.subStatus = "gameReady";
        saveGame(game);
        console.log({ matchedGameId });

        // به همه در اتاق برودکست کن
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
