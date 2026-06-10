import { SocketContext } from "../socket-context";
import { GameQueue } from "../../game/gameQueue";
import {
  loadGameState,
  calculateSubStatus,
  undoLastMove,
} from "../../game/eventStore";
import { generateMoveSequences } from "../../game/moveGenerator";
import {
  onOkSocketResponse,
  onErrorSocketResponse,
} from "../../responses/response-builder";
import { runBotIfNeeded } from "@/game/botRunner";
import { RoomManager } from "../room-manager";

const gameQueue = new GameQueue();

function broadcastTurnChange(gameId: number, game: any, rooms: RoomManager) {
  const nextPlayer = game.players.find((p: any) => p.id === game.turn);
  if (nextPlayer) {
    rooms.broadcast(gameId, {
      type: "game.turn",
      payload: onOkSocketResponse({
        playerId: nextPlayer.id,
        color: nextPlayer.color,
      }),
    });
  }
}

export async function handleUndo(
  ctx: SocketContext,
  payload: { gameId: number },
  rooms: RoomManager,
) {
  const { gameId } = payload;
  const playerId = ctx.userId;

  if (!playerId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not authenticated"),
    });
  }

  await gameQueue.enqueue(gameId, async () => {
    // ۱. لود کردن استیت فعلی برای چک کردن نوبت
    const currentGame = await loadGameState(gameId);
    if (!currentGame || currentGame.turn !== playerId) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("نوبت شما نیست یا بازی پیدا نشد"),
      });
    }

    // ۲. undo آخرین حرکت
    const undone = await undoLastMove(gameId, playerId);
    if (!undone) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("حرکتی برای برگشت وجود ندارد"),
      });
    }

    // ۳. بازسازی کامل استیت (Re-build state from events)
    const updatedGame = await loadGameState(gameId);
    if (!updatedGame) return;

    // ۴. محاسبه مجدد وضعیت‌های UI
    updatedGame.subStatus = calculateSubStatus(updatedGame);
    const legalMoves = generateMoveSequences(updatedGame, playerId);

    // ۵. ارسال game.turn برای اطلاع‌رسانی نوبت جدید (در صورت تغییر)
    broadcastTurnChange(gameId, updatedGame, rooms);

    // ۶. ارسال state جدید
    rooms.broadcast(gameId, {
      type: "game.state",
      payload: onOkSocketResponse(updatedGame),
    });

    rooms.broadcast(gameId, {
      type: "game.legalMoves",
      payload: onOkSocketResponse(legalMoves),
    });

    // ۷. ارسال یک رویداد حرکت برای بازخورد بصری Undo (اختیاری)
    // اگر کلاینت شما برای نمایش انیمیشن Undo نیاز به player.move دارد، این بخش را فعال کنید
    if (undone && (undone as any).from !== undefined) {
      rooms.broadcast(gameId, {
        type: "player.move",
        payload: onOkSocketResponse([
          {
            playerId,
            from: (undone as any).from,
            to: (undone as any).to,
            die: (undone as any).die,
            ownerId: playerId,
            isUndo: true,
          },
        ]),
      });
    }

    // ۸. اگر بعد از Undo نوبت بات است، اجرا کن
    if (updatedGame.status === "in-progress") {
      const botId = updatedGame.players.find((p) => p.id !== playerId)?.id;
      if (botId && updatedGame.turn === botId) {
        await runBotIfNeeded(gameId, botId, rooms);
      }
    }
  });
}
