import { WebSocketServer } from "ws";
import { SocketContext } from "./socket-context";
import { MessageRouter } from "./message-router";
import { ClientMessage } from "./protocol";
import { RoomManager } from "./room-manager";
import { clearWaitingUser, handleJoin } from "./handlers/join";
import { handleRoll } from "./handlers/roll";
import { handleMove } from "./handlers/move";
import { handleLeave } from "./handlers/leave";
import { handleEndTurn } from "./handlers/endTurn";
import { getGame } from "@/game/gameStore";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import { handleReady } from "./handlers/ready";
import { logWSMessage } from "@/utils/wsLogger"; // <-- اضافه شده
import {
  handleCubeOffer,
  handleCubeRespond,
} from "./handlers/doublingCube";
import {
  handlePracticeBearOff,
  handlePracticeRearrange,
  handlePracticeSetupBoard,
} from "./handlers/practice";

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
  router.register("game.endTurn", handleEndTurn);
  router.register("game.cube.offer", handleCubeOffer);
  router.register("game.cube.respond", handleCubeRespond);
  router.register("game.practice.bearoff", handlePracticeBearOff);
  router.register("game.practice.rearrange", handlePracticeRearrange);
  router.register("game.practice.setup_board", handlePracticeSetupBoard);
  wss.on("connection", (ws) => {
    const ctx = new SocketContext(ws);
    console.log(`[Socket] Player connected: ${ctx.id}`);

    // ذخیره متد اصلی send با bind برای حفظ context
    const originalSend = ws.send.bind(ws);
    ws.send = function (data: any) {
      const raw = typeof data === "string" ? data : JSON.stringify(data);
      let gameId: number | undefined;
      let type: string | undefined;
      try {
        const parsed = JSON.parse(raw);
        gameId = parsed.payload?.data?.id || parsed.payload?.gameId;
        type = parsed.type;
      } catch (e) {}
      logWSMessage("out", raw, gameId, type);
      // فراخوانی متد اصلی با یک آرگومان (مابقی اختیاری)
      return originalSend(data);
    };

    ws.on("message", (raw) => {
      const rawStr = raw.toString();
      let gameId: number | undefined;
      let type: string | undefined;
      try {
        const parsed = JSON.parse(rawStr);
        gameId = parsed.payload?.gameId;
        type = parsed.type;
      } catch (e) {}
      logWSMessage("in", rawStr, gameId, type);

      try {
        const message = JSON.parse(rawStr) as ClientMessage;
        router.dispatch(ctx, message);
      } catch {
        ctx.send({
          type: "game.error",
          payload: onErrorSocketResponse("Invalid JSON format"),
        });
      }
    });

    ws.on("close", () => {
      const userId = ctx.userId;
      if (userId) {
        clearWaitingUser(userId);
      }
      const gameId = rooms.getRoomOfSocket(ctx);
      if (gameId) {
        const game = getGame(gameId);
        if (game) {
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
