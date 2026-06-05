// src/game/botRunner.ts
import { loadGameState, appendGameEvent } from "./eventStore";
import { generateMoveSequences, flattenMoveSequences } from "./moveGenerator";
import { rollDice as rollDiceUtil } from "@/utils/dice";
import { validateMove } from "./ruleValidator";
import { PlayerId } from "./types";
import { RoomManager } from "@/socket/room-manager";
import { onOkSocketResponse } from "@/responses/response-builder";

export async function runBotIfNeeded(
  gameId: number,
  playerId: PlayerId,
  rooms: RoomManager, // اضافه شد
) {
  if (playerId !== 1) return;

  const state = await loadGameState(gameId);
  if (!state) return;
  if (state.status !== "in-progress") return;
  if (state.turn !== playerId) return;

  // اگر تاس نداریم → بریز و برادکست کن
  if (!state.dice || state.dice.length === 0) {
    const dice = rollDiceUtil();
    await appendGameEvent(gameId, {
      type: "DICE_ROLLED",
      payload: { playerId, dice },
    });
    const newState = await loadGameState(gameId);
    if (newState) {
      rooms.broadcast(gameId, {
        type: "game.state",
        payload: onOkSocketResponse(newState),
      });
    }
    // بعد از ریختن تاس، دوباره صدا بزن (با تأخیر کوتاه)
    setTimeout(() => runBotIfNeeded(gameId, playerId, rooms), 100);
    return;
  }

  // حرکات قانونی
  const sequences = generateMoveSequences(state, playerId);
  const moves = flattenMoveSequences(sequences);
  if (moves.length === 0) {
    await appendGameEvent(gameId, {
      type: "TURN_PASSED",
      payload: { playerId, reason: "NO_LEGAL_MOVES" },
    });
    const newState = await loadGameState(gameId);
    if (newState) {
      rooms.broadcast(gameId, {
        type: "game.state",
        payload: onOkSocketResponse(newState),
      });
    }
    return;
  }

  // بهترین حرکت (اولین)
  const bestMove = moves[0];
  const validation = validateMove(state, playerId, bestMove.from, bestMove.to, [
    bestMove.die,
  ]);
  if (!validation.isValid) {
    console.warn(`[Bot] Invalid move: ${validation.message}`);
    return;
  }

  await appendGameEvent(gameId, {
    type: "MOVE_APPLIED",
    payload: {
      playerId,
      from: bestMove.from,
      to: bestMove.to,
      die: bestMove.die,
    },
  });

  const afterMoveState = await loadGameState(gameId);
  if (afterMoveState) {
    rooms.broadcast(gameId, {
      type: "game.state",
      payload: onOkSocketResponse(afterMoveState),
    });
  }

  // اگر بعد از حرکت تاس‌ها تمام شد، نوبت را خودکار عوض کن
  if (
    afterMoveState &&
    afterMoveState.dice &&
    afterMoveState.dice.length === 0
  ) {
    await appendGameEvent(gameId, {
      type: "TURN_PASSED",
      payload: { playerId, reason: "NO_LEGAL_MOVES" },
    });
    const finalState = await loadGameState(gameId);
    if (finalState) {
      rooms.broadcast(gameId, {
        type: "game.state",
        payload: onOkSocketResponse(finalState),
      });
    }
  }
}
