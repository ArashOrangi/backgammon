import { getGame, saveGame } from "../../game/gameStore";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import { generateMoveSequences } from "../../game/moveGenerator";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import {
  appendGameEvent,
  loadGameState,
  calculateSubStatus,
} from "@/game/eventStore";
import { GameQueue } from "@/game/gameQueue";

const gameQueue = new GameQueue();

export async function handleEndTurn(
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
    const game = getGame(gameId);

    if (!game) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Game not found"),
      });
    }

    // 1. بررسی اینکه آیا واقعاً نوبت این بازیکن هست یا نه
    if (game.turn !== playerId) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("It's not your turn to end"),
      });
    }

    // 2. بررسی وضعیت فعلی (آیا مجاز به پایان نوبت هست؟)
    const currentSubStatus = calculateSubStatus(game);

    if (currentSubStatus === "playDice") {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("You still have legal moves available!"),
      });
    }

    // اگر بازیکن هنوز تاس نریخته (waitingRoll)، نباید بتونه نوبت رو پاس بده (مگر در قوانین خاص)
    if (currentSubStatus === "waitingRoll") {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("You must roll the dice first"),
      });
    }

    try {
      // 3. ثبت رویداد پایان نوبت دستی
      await appendGameEvent(gameId, {
        type: "TURN_PASSED",
        payload: { playerId, reason: "MANUAL_END" },
      });

      // 4. بازسازی استیت جدید (که در آن نوبت عوض شده و تاس‌ها خالی شده‌اند)
      const updatedGame = await loadGameState(gameId);
      if (!updatedGame) throw new Error("Failed to reload game state");

      // 5. ذخیره در کش و اطلاع‌رسانی به همه
      saveGame(updatedGame);

      // تزریق وضعیت جدید برای نفر بعدی (که طبیعتاً waitingRoll خواهد بود)
      (updatedGame as any).subStatus = calculateSubStatus(updatedGame);

      rooms.broadcast(gameId, {
        type: "game.state",
        payload: onOkSocketResponse(updatedGame, "Turn passed successfully"),
      });

      // پاک کردن لیست حرکات قانونی برای کلاینت‌ها
      rooms.broadcast(gameId, {
        type: "game.legalMoves",
        payload: onOkSocketResponse([]),
      });
    } catch (err) {
      console.error("EndTurn Error:", err);
      ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Failed to end turn"),
      });
    }
  });
}
