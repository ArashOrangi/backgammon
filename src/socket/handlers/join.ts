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

type JoinPayload = { gameId: number; userId: number };

export async function handleJoin(
  ctx: SocketContext,
  payload: JoinPayload,
  rooms: RoomManager,
) {
  const { gameId, userId } = payload;

  // ذخیره userId در کانتکست برای استفاده در سایر هندلرها
  ctx.userId = userId;

  try {
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

      // اختصاص رنگ و شناسه عددی به بازیکن
      ctx.send({
        type: "player.assign",
        payload: { color, playerId: userId },
      });

      // اگر نفر دوم آمد
      if (game.players.length === 2) {
        game.status = "ready";

        rooms.broadcast(gameId, {
          type: "room.ready",
          payload: { gameId },
        });

        game.status = "starting";
      }

      saveGame(game);
    }

    rooms.join(gameId, ctx, "player");

    // ارسال وضعیت کامل بازی به همه
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
