import { saveGame } from "../../game/gameStore";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import {
  flattenMoveSequences,
  generateMoveSequences,
} from "../../game/moveGenerator";
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
import { runBotIfNeeded } from "@/game/botRunner";
import { BOT_USER_ID } from "@/static/statics";
import { clearPendingEndTurn } from "./roll";
// ایمپورت توابع تایمر
import { resetWarningState, broadcastTimerStarted } from "@/game/engine/timer";

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
  console.log(
    `[ENDTURN] Received endTurn from player ${playerId} for game ${gameId}`,
  );

  await gameQueue.enqueue(gameId, async () => {
    const game = await loadGameState(gameId);
    if (!game) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Game not found"),
      });
    }

    if (game.turn !== playerId) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("It's not your turn to end"),
      });
    }

    const currentSubStatus = calculateSubStatus(game);

    // فقط زمانی که حرکت قانونی وجود دارد (playDice) نباید اجازه endTurn بدهیم
    if (currentSubStatus === "playDice") {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("You still have legal moves available!"),
      });
    }

    // پاک کردن وضعیت pending endTurn
    clearPendingEndTurn(gameId);

    try {
      await appendGameEvent(gameId, {
        type: "TURN_PASSED",
        payload: { playerId, reason: "MANUAL_END" },
      });

      const updatedGame = await loadGameState(gameId);
      if (!updatedGame) throw new Error("Failed to reload game state");

      saveGame(updatedGame);

      // ریست وضعیت هشدار تایمر (در صورت نیاز – قبلاً در eventStore انجام شده ولی برای اطمینان)
      resetWarningState(gameId);

      // ارسال رویداد game.turn برای اطلاع‌رسانی مستقیم نوبت جدید
      const nextPlayer = updatedGame.players.find(
        (p) => p.id === updatedGame.turn,
      );
      if (nextPlayer) {
        rooms.broadcast(gameId, {
          type: "game.turn",
          payload: onOkSocketResponse({
            playerId: nextPlayer.id,
            color: nextPlayer.color,
          }),
        });

        // ✅ ارسال رویداد شروع تایمر برای نوبت جدید
        broadcastTimerStarted(
          gameId,
          updatedGame.turn!,
          updatedGame.primaryTimePerTurn,
          updatedGame.secondaryTimeBank[updatedGame.turn!] || 0,
          updatedGame.turnStartedAt!,
          rooms,
        );
      }

      let legalMoves: any[] = [];
      if (updatedGame.turn !== null) {
        legalMoves = generateMoveSequences(updatedGame, updatedGame.turn);
      }

      const flatLegalMoves = flattenMoveSequences(legalMoves);
      const stateToSend = {
        ...updatedGame,
        subStatus: "mustEndTurn",
        legalMoves: flatLegalMoves,
      };

      rooms.broadcast(gameId, {
        type: "game.state",
        payload: onOkSocketResponse(stateToSend, "Turn passed successfully"),
      });

      // تأخیر ۱۰۰ میلی‌ثانیه قبل از اجرای ربات
      await new Promise((resolve) => setTimeout(resolve, 100));

      // اگر نوبت بات است، بلافاصله اجرا کن
      if (updatedGame.status === "in-progress") {
        const opponentId = updatedGame.players.find(
          (p) => p.id !== playerId,
        )?.id;
        if (opponentId && updatedGame.turn === opponentId) {
          await runBotIfNeeded(gameId, opponentId, rooms);
        }
      }
    } catch (err) {
      console.error("EndTurn Error:", err);
      ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Failed to end turn"),
      });
    }
  });
}
