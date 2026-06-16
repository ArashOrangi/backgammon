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

const gameQueue = new GameQueue();
const AUTO_PASS_DELAY_MS = 500;

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

    if (currentSubStatus === "playDice") {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("You still have legal moves available!"),
      });
    }

    try {
      await appendGameEvent(gameId, {
        type: "TURN_PASSED",
        payload: { playerId, reason: "MANUAL_END" },
      });

      // ✅ اضافه کردن دیلی قبل از broadcast
      await new Promise((resolve) => setTimeout(resolve, AUTO_PASS_DELAY_MS));

      const updatedGame = await loadGameState(gameId);
      if (!updatedGame) throw new Error("Failed to reload game state");

      saveGame(updatedGame);

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

      // ✅ اضافه کردن دیلی قبل از اجرای ربات
      await new Promise((resolve) => setTimeout(resolve, 100));

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
