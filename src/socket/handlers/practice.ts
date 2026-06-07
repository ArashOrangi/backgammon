import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import { appendGameEvent, loadGameState } from "@/game/eventStore";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import { GameQueue } from "@/game/gameQueue";

const gameQueue = new GameQueue();

export async function handlePracticeBearOff(
  ctx: SocketContext,
  payload: { gameId: number },
  rooms: RoomManager,
) {
  const playerId = ctx.userId;
  if (!playerId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not authenticated"),
    });
  }

  await gameQueue.enqueue(payload.gameId, async () => {
    const game = await loadGameState(payload.gameId);
    if (!game) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Game not found"),
      });
    }

    // محدودیت ساده: فقط در حالت in-progress یا waiting (برای تمرین)
    if (game.status !== "in-progress" && game.status !== "waiting") {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Cannot practice in current game state"),
      });
    }

    await appendGameEvent(payload.gameId, {
      type: "PRACTICE_BEAROFF_SETUP",
      payload: { playerId },
    });

    const updatedGame = await loadGameState(payload.gameId);
    if (updatedGame) {
      rooms.broadcast(payload.gameId, {
        type: "game.state",
        payload: onOkSocketResponse(
          updatedGame,
          "Practice mode: all checkers in home",
        ),
      });
    }
  });
}

// هندلر جدید برای چیدمان دلخواه
export async function handlePracticeRearrange(
  ctx: SocketContext,
  payload: { gameId: number; points: Array<{ index: number; count: number }> },
  rooms: RoomManager,
) {
  const playerId = ctx.userId;
  if (!playerId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not authenticated"),
    });
  }

  // اعتبارسنجی ساده: مجموع مهره‌ها باید ۱۵ باشد
  const total = payload.points.reduce((sum, p) => sum + p.count, 0);
  if (total !== 15) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Total checkers must be exactly 15"),
    });
  }
  for (const p of payload.points) {
    if (p.index < 0 || p.index >= 24 || p.count < 0) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Invalid point index or count"),
      });
    }
  }

  await gameQueue.enqueue(payload.gameId, async () => {
    const game = await loadGameState(payload.gameId);
    if (!game) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Game not found"),
      });
    }

    // محدودیت امنیتی: فقط در بازی با بات (اینجا فرض می‌کنیم بات ID=1 دارد)
    const isBotGame = game.players.some((p) => p.id === 1);
    if (!isBotGame) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse(
          "Rearrange only allowed in practice games against bot",
        ),
      });
    }

    await appendGameEvent(payload.gameId, {
      type: "PRACTICE_REARRANGE",
      payload: { playerId, points: payload.points },
    });

    const updatedGame = await loadGameState(payload.gameId);
    if (updatedGame) {
      rooms.broadcast(payload.gameId, {
        type: "game.state",
        payload: onOkSocketResponse(updatedGame, "Board rearranged"),
      });
    }
  });
}
