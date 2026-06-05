import { loadGameState, appendGameEvent } from "./eventStore";
import { generateMoveSequences, flattenMoveSequences } from "./moveGenerator";
import { rollDice as rollDiceUtil } from "@/utils/dice";
import { validateMove } from "./ruleValidator";
import { PlayerId } from "./types";

const BOT_USER_ID = 1; // همان مقدار دیتابیس

export async function runBotIfNeeded(gameId: number, playerId: PlayerId) {
  // فقط اگر بازیکن مورد نظر بات باشد، اجرا کن
  if (playerId !== BOT_USER_ID) return;

  const state = await loadGameState(gameId);
  if (!state) return;
  if (state.status !== "in-progress") return;
  if (state.turn !== playerId) return; // اطمینان از نوبت بات

  // اگر تاس نداریم → بریز
  if (!state.dice || state.dice.length === 0) {
    const dice = rollDiceUtil();
    await appendGameEvent(gameId, {
      type: "DICE_ROLLED",
      payload: { playerId, dice },
    });
    // پس از ریختن تاس، دوباره صدا بزن (با تأخیر کم برای ثبت رویداد)
    setTimeout(() => runBotIfNeeded(gameId, playerId), 100);
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
    return;
  }

  // بهترین حرکت (اولین حرکت)
  const bestMove = moves[0];
  const validation = validateMove(state, playerId, bestMove.from, bestMove.to, [
    bestMove.die,
  ]);
  if (!validation.isValid) {
    console.warn(`[Bot] Move invalid: ${validation.message}`);
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

  // بعد از حرکت، اگر تاس تمام شد، نوبت را تمام کن
  const newState = await loadGameState(gameId);
  if (newState && newState.dice && newState.dice.length === 0) {
    await appendGameEvent(gameId, {
      type: "TURN_PASSED",
      payload: { playerId, reason: "NO_LEGAL_MOVES" },
    });
  }
}
