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

    if (currentSubStatus === "playDice") {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("You still have legal moves available!"),
      });
    }

    clearPendingEndTurn(gameId);

    try {
      await appendGameEvent(gameId, {
        type: "TURN_PASSED",
        payload: { playerId, reason: "MANUAL_END" },
      });

      const updatedGame = await loadGameState(gameId);
      if (!updatedGame) throw new Error("Failed to reload game state");

      saveGame(updatedGame);
      resetWarningState(gameId);

      // 1. First send game.state with correct subStatus
      let legalMoves: any[] = [];
      if (updatedGame.turn !== null) {
        legalMoves = generateMoveSequences(updatedGame, updatedGame.turn);
      }
      const flatLegalMoves = flattenMoveSequences(legalMoves);
      const subStatus = calculateSubStatus(updatedGame);
      const stateToSend = {
        ...updatedGame,
        subStatus,
        legalMoves: flatLegalMoves,
      };

      rooms.broadcast(gameId, {
        type: "game.state",
        payload: onOkSocketResponse(stateToSend, "Turn passed successfully"),
      });

      // 2. Then send game.turn
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

        // 3. Send timer.started only if subStatus is playDice or waitForRoll
        if (subStatus === "playDice" || subStatus === "waitForRoll") {
          broadcastTimerStarted(
            gameId,
            updatedGame.turn!,
            updatedGame.primaryTimePerTurn,
            updatedGame.secondaryTimeBank[updatedGame.turn!] || 0,
            updatedGame.turnStartedAt!,
            rooms,
          );
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      if (updatedGame.status === "in-progress") {
        const opponentId = updatedGame.players.find(
          (p) => p.id !== playerId,
        )?.id;
        if (opponentId && updatedGame.turn === opponentId) {
          await runBotIfNeeded(gameId, opponentId, rooms);
        }
      }
      console.log("just random");
    } catch (err) {
      console.error("EndTurn Error:", err);
      ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Failed to end turn"),
      });
    }
  });
}
