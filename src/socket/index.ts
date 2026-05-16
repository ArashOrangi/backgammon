import { WebSocketServer } from "ws";
import { SocketContext } from "./socket-context";
import { MessageRouter } from "./message-router";
import { ClientMessage } from "./protocol";
import { RoomManager } from "./room-manager";

import { handleJoin } from "./handlers/join";
import { handleRoll } from "./handlers/roll";
import { handleMove } from "./handlers/move";
import { handleLeave } from "./handlers/leave";

import { getGame, saveGame, deleteGame } from "@/game/gameStore";
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
      if (!gameId) {
        rooms.leave(ctx);
        return;
      }

      const game = getGame(gameId);
      if (!game) {
        rooms.leave(ctx);
        return;
      }

      // پیدا کردن بازیکن
      const player = game.players.find((p) => p.id === ctx.id);
      if (!player) {
        rooms.leave(ctx);
        return;
      }

      console.log(`Player disconnected: ${ctx.id}`);

      // حذف بازیکن
      game.players = game.players.filter((p) => p.id !== ctx.id);

      // پاک کردن داده‌های وابسته
      delete game.board.bar[ctx.id];
      delete game.board.borneOff[ctx.id];

      /* -------------------------------- */
      /* اگر بازی خالی شد → حذف کامل */
      /* -------------------------------- */
      if (game.players.length === 0) {
        deleteGame(game.id);
        rooms.leave(ctx);
        return;
      }

      /* -------------------------------- */
      /* اگر یک نفر باقی ماند → برنده شود */
      /* -------------------------------- */
      if (game.players.length === 1 && game.status !== "finished") {
        const remaining = game.players[0];

        game.status = "finished";
        game.winner = remaining.id;
        game.dice = undefined;

        saveGame(game);

        rooms.broadcast(game.id, {
          type: "game.state",
          payload: onOkSocketResponse(game, "Opponent disconnected"),
        });

        rooms.leave(ctx);
        return;
      }

      /* -------------------------------- */
      /* اگر نوبت بازیکن خارج‌شده بود */
      /* -------------------------------- */
      if (game.turn === ctx.id) {
        game.dice = undefined;

        // سوییچ به بازیکن بعدی
        game.turn = game.players[0].id;
      }

      saveGame(game);

      rooms.broadcast(game.id, {
        type: "game.state",
        payload: onOkSocketResponse(game),
      });

      rooms.leave(ctx);
    });
  });
}
