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
import { createInitialBoard } from "@/game/board";

type JoinPayload = { gameId: string };

export async function handleJoin(
  ctx: SocketContext,
  payload: { gameId: string },
  rooms: RoomManager,
) {
  const { gameId } = payload;
  const playerId = ctx.id;

  try {
    let game = getGame(gameId);
    if (!game) {
      game = createInitialGameState(gameId);
      saveGame(game);
    }

    const alreadyInGame = game.players.find((p) => p.id === playerId);

    if (!alreadyInGame) {
      if (game.players.length >= 2) {
        return ctx.send({
          type: "game.error",
          payload: { message: "Game is full" },
        } as any);
      }

      const color = game.players.length === 0 ? "white" : "black";
      game.players.push({ id: playerId, color });

      // ایونت Assign: اختصاصی برای پلیر جدید
      ctx.send({
        type: "player.assign",
        payload: { color, playerId },
      } as any);

      // اگر نفر دوم آمد
      if (game.players.length === 2) {
        game.status = "ready"; // تغییر وضعیت به آماده

        // ایونت RoomReady: برودکاست به همه
        rooms.broadcast(gameId, {
          type: "room.ready",
          payload: { gameId },
        });

        // حالا باید وارد فاز Starting Dice شویم (تاس ریختن برای شروع)
        // این بخش معمولا در handleRoll یا یک تایمر اتوماتیک هندل می‌شود
        // اما برای اینکه لیست مدیر فنی کامل شود:
        game.status = "starting";

        // نکته کنجکاوانه: در تخته‌نرد واقعی، اولین حرکت با همان تاس‌های شروع انجام می‌شود.
        // اینجا می‌توانیم منطق شروع را صدا بزنیم.
      }

      saveGame(game);
    }

    rooms.join(gameId, ctx, "player");

    // سینک نهایی وضعیت برای کلاینت
    rooms.broadcast(gameId, {
      type: "game.state",
      payload: onOkSocketResponse(game),
    });
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
