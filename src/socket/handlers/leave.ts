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

type LeavePayload = { gameId: number };

export async function handleLeave(
  ctx: SocketContext,
  payload: LeavePayload,
  rooms: RoomManager,
) {
  const { gameId } = payload;
  const playerId = ctx.userId; // شناسه عددی کاربر

  // بررسی احراز هویت
  if (!playerId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not authenticated"),
    });
  }

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
      // سناریو ۱: بازی شروع نشده (waiting یا ready)
      if (game.status === "waiting" || game.status === "ready") {
        // ثبت رویداد خروج (playerId عددی)
        await appendGameEvent(game.id, {
          type: "PLAYER_LEFT",
          payload: { playerId },
        });

        const updatedGame = await loadGameState(game.id);
        if (updatedGame) {
          saveGame(updatedGame);
          rooms.leave(ctx);

          rooms.broadcast(gameId, {
            type: "game.state",
            payload: onOkSocketResponse(updatedGame, "Player left"),
          });
        }
        return;
      }

      // سناریو ۲: بازی در جریان است (starting یا in-progress)
      rooms.leave(ctx);

      rooms.broadcast(gameId, {
        type: "network.timeout",
        payload: { playerId, timeoutAt: Date.now() + 60000 },
      });
    } catch (err) {
      console.error("Leave Error:", err);
      ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Failed to process leave"),
      });
    }
  });
}
