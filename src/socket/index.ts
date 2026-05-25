import { WebSocketServer } from "ws";
import { SocketContext } from "./socket-context";
import { MessageRouter } from "./message-router";
import { ClientMessage } from "./protocol";
import { RoomManager } from "./room-manager";

import { handleJoin } from "./handlers/join";
import { handleRoll } from "./handlers/roll";
import { handleMove } from "./handlers/move";
import { handleLeave } from "./handlers/leave";

import { getGame } from "@/game/gameStore";
import { onErrorSocketResponse } from "@/responses/response-builder";

/** اینجا rooms رو به عنوان آرگومان دوم اضافه کردیم تا در کل برنامه
 * یک Instance واحد داشته باشیم و Game Loop بتونه بهش دسترسی داشته باشه.
 */
export function registerSocketHandlers(
  wss: WebSocketServer,
  rooms: RoomManager,
) {
  const router = new MessageRouter(rooms);

  router.register("game.join", handleJoin);
  router.register("game.roll", handleRoll);
  router.register("game.move", handleMove);
  router.register("player.leave", handleLeave);

  wss.on("connection", (ws) => {
    const ctx = new SocketContext(ws);

    console.log(`[Socket] Player connected: ${ctx.id}`);

    ws.on("message", (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as ClientMessage;
        router.dispatch(ctx, message);
      } catch {
        ctx.send({
          type: "game.error",
          payload: onErrorSocketResponse("Invalid JSON format"),
        });
      }
    });

    ws.on("close", () => {
      const gameId = rooms.getRoomOfSocket(ctx);
      if (gameId) {
        const game = getGame(gameId);
        if (game) {
          console.log(
            `[Socket] Player ${ctx.id} went offline. Waiting for timeout...`,
          );

          // برودکست وضعیت آفلاین برای آگاهی حریف (UI می‌تونه تایمر نشون بده)
          rooms.broadcast(gameId, {
            type: "network.timeout",
            payload: {
              playerId: ctx.id,
              timeoutAt: Date.now() + 60000, // اطلاع‌رسانی که ۶۰ ثانیه وقت داره برگرده
            },
          } as any);
        }
      }
      rooms.leave(ctx);
    });
  });
}
