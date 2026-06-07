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

    // فقط اجازه دهید اگر بازی با بات است یا در حالت تمرین (مثلاً status === "practice")
    // یا حداقل بازی در حال انجام نباشد تا در مسابقات واقعی تقلب نشود
    if (game.status !== "in-progress" && game.status !== "waiting") {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Cannot practice in current game state"),
      });
    }

    // ثبت رویداد تنظیم تمرین
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
