import { WebSocketServer } from "ws";
import { SocketContext } from "./socket-context";
import { MessageRouter } from "./message-router";
import { ClientMessage } from "./protocol";
import { RoomManager } from "./room-manager";

import { handleJoin } from "./handlers/join";
import { handleRoll } from "./handlers/roll";
import { handleMove } from "./handlers/move";
import { handleLeave } from "./handlers/leave";

import { getGame, saveGame, deleteGame } from "@/game/game.store";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";

export function registerSocketHandlers(wss: WebSocketServer) {
  const rooms = new RoomManager();
  const router = new MessageRouter(rooms);

  router.register("game.join", handleJoin);
  router.register("game.roll", handleRoll);
  router.register("game.move", handleMove);
  router.register("player.leave", handleLeave);

  wss.on("connection", (ws) => {
    const ctx = new SocketContext(ws);

    console.log(`Player connected: ${ctx.id}`);

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
          game.players = game.players.filter((p) => p !== ctx.id);

          if (game.players.length === 0) {
            deleteGame(game.id);
          } else {
            saveGame(game);

            rooms.broadcast(game.id, {
              type: "game.state",
              payload: onOkSocketResponse(game),
            });
          }
        }
      }

      rooms.leave(ctx);
    });
  });
}
