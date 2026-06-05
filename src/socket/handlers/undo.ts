import { SocketContext } from "../socket-context";
import { GameQueue } from "../../game/gameQueue";
import { loadGameState, calculateSubStatus } from "../../game/eventStore";
import { prismaGameEventDeleteLastMove } from "../../models/gameEvent";
import { generateMoveSequences } from "../../game/moveGenerator";
import {
  onOkSocketResponse,
  onErrorSocketResponse,
} from "../../responses/response-builder";
import { runBotIfNeeded } from "@/game/botRunner"; // اضافه شده

const gameQueue = new GameQueue();

export async function handleUndo(
  ctx: SocketContext,
  payload: { gameId: number },
  rooms: any,
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

    // ۲. حذف آخرین حرکت از دیتابیس
    const deleted = await prismaGameEventDeleteLastMove(gameId, playerId);

    if (!deleted) {
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

    // ۵. خبر دادن به همه برای آپدیت گرافیک
    rooms.broadcast(gameId, {
      type: "game.state",
      payload: onOkSocketResponse(updatedGame),
    });

    rooms.broadcast(gameId, {
      type: "game.legalMoves",
      payload: onOkSocketResponse(legalMoves),
    });

    // ۶. اگر بعد از Undo نوبت بات است، اجرا کن
    if (updatedGame.status === "in-progress") {
      const botId = updatedGame.players.find((p) => p.id !== playerId)?.id;
      if (botId && updatedGame.turn === botId) {
        await runBotIfNeeded(gameId, botId);
      }
    }
  });
}
