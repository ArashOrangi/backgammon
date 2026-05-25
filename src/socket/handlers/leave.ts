import { getGame, saveGame } from "../../game/gameStore";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import { appendGameEvent, loadGameState } from "@/game/eventStore";
import { GameQueue } from "@/game/gameQueue";

const gameQueue = new GameQueue();

type LeavePayload = { gameId: string };

export async function handleLeave(
  ctx: SocketContext,
  payload: LeavePayload,
  rooms: RoomManager,
) {
  const { gameId } = payload;
  const playerId = ctx.id;

  await gameQueue.enqueue(gameId, async () => {
    const game = getGame(gameId);

    if (!game) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Game not found"),
      });
    }

    const player = game.players.find((p) => p.id === playerId);
    if (!player) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Player not in game"),
      });
    }

    try {
      /* 
         سناریو ۱: بازی هنوز شروع نشده (در وضعیت Waiting یا Ready)
         در این حالت بازیکن کلاً از لیست حذف می‌شود.
      */
      if (game.status === "waiting" || game.status === "ready") {
        // ثبت در دیتابیس
        await appendGameEvent(Number(game.id), {
          type: "PLAYER_LEFT",
          payload: { playerId },
        });

        // بازسازی استیت (که در applyEvent منطق حذف بازیکن را دارد)
        const updatedGame = await loadGameState(Number(game.id));

        if (updatedGame) {
          saveGame(updatedGame);
          rooms.leave(ctx); // خروج از اتاق Socket.io/Room

          // اطلاع‌رسانی به نفر باقی‌مانده
          rooms.broadcast(gameId, {
            type: "game.state",
            payload: onOkSocketResponse(updatedGame, "Player left"),
          });
        }
        return;
      }

      /* 
         سناریو ۲: بازی در جریان است (starting یا in-progress)
         در اینجا نباید بازیکن را حذف کنیم! فقط وضعیت را به "offline" تغییر می‌دهیم
         تا سیستم تایمر (NetworkTimeout) شروع به شمارش معکوس کند.
      */
      rooms.leave(ctx); // بازیکن از کانال خارج شد

      // ارسال ایونت آفلاین شدن برای حریف
      rooms.broadcast(gameId, {
        type: "network.timeout", // یا یک ایونت سفارشی مثل player.offline
        payload: { playerId, timeoutAt: Date.now() + 60000 }, // مثلا ۶۰ ثانیه فرصت برگشت
      });

      // نکته: ما بازیکن را از `game.players` حذف نمی‌کنیم تا بتواند Reconnect کند.
      // اگر تا ۶۰ ثانیه برنگردد، گیم‌لوپ (Timer) بازی را با وضعیت "finished" می‌بندد.
    } catch (err) {
      console.error("Leave Error:", err);
      ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Failed to process leave"),
      });
    }
  });
}
