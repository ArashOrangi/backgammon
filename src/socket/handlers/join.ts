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
    if (gameId === -1) {
      const matchedGameId = await addToMatchmaking(userId);
      if (matchedGameId === 0) {
        // در صف قرار گرفت، منتظر حریف – استفاده از as any برای رفع موقت خطای تایپ
        const waitingGame = createInitialGameState(-1);
        waitingGame.status = "waiting";
        waitingGame.subStatus = "playerJoin";
        waitingGame.players = [{ id: userId, color: "white" }];
        return ctx.send({
          type: "game.state",
          payload: onOkSocketResponse(waitingGame, "Waiting for opponent"),
        } as any);
      } else {
        gameId = matchedGameId;
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
