import { WebSocketServer } from "ws";
import { SocketContext } from "./socket-context";
import { MessageRouter } from "./message-router";
import { ClientMessage } from "./protocol";
import { RoomManager } from "./room-manager";

import { handleJoin } from "./handlers/join";
import { handleRoll } from "./handlers/roll";
import { handleMove } from "./handlers/move";
import { handleLeave } from "./handlers/leave";
import { handleEndTurn } from "./handlers/endTurn"; // <--- ۱. اضافه کردن هندلر جدید

import { getGame } from "@/game/gameStore";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import { handleReady } from "./handlers/ready";

export function registerSocketHandlers(
  wss: WebSocketServer,
  rooms: RoomManager,
) {
  const router = new MessageRouter(rooms);

  router.register("game.join", handleJoin);
  router.register("player.ready", handleReady);
  router.register("game.roll", handleRoll);
  router.register("game.move", handleMove);
  router.register("player.leave", handleLeave);
  router.register("game.endTurn", handleEndTurn); // <---  ریجیستر کردن برای استفاده کلاینت

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
          // 3. اینجا بهتره از ctx.userId استفاده کنی چون ID سوکت با هر بار رفرش عوض میشه
          // اما userId همونیه که توی دیتابیس داری.
          const disconnectingPlayerId = ctx.userId || ctx.id;

          console.log(
            `[Socket] Player ${disconnectingPlayerId} went offline. Waiting for timeout...`,
          );

          rooms.broadcast(gameId, {
            type: "network.timeout",
            payload: onOkSocketResponse({
              playerId: disconnectingPlayerId,
              timeoutAt: Date.now() + 60000,
            }),
          });
        }
      }
      rooms.leave(ctx);
    });
  });
}
