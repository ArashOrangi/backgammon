import { loadGameState, appendGameEvent } from "./eventStore";
import { generateMoveSequences, flattenMoveSequences } from "./moveGenerator";
import { rollDice as rollDiceUtil } from "@/utils/dice";
import { validateMove } from "./ruleValidator";
import { PlayerId } from "./types";
import { RoomManager } from "@/socket/room-manager";
import { onOkSocketResponse } from "@/responses/response-builder";
import { BOT_USER_ID } from "@/static/statics";

export async function runBotIfNeeded(
  gameId: number,
  playerId: PlayerId,
  rooms: RoomManager,
) {
  console.log(
    `[Bot] runBotIfNeeded called for game ${gameId}, player ${playerId}`,
  );

  if (playerId !== BOT_USER_ID) {
    console.log(`[Bot] Not a bot (${playerId} !== ${BOT_USER_ID}), skipping`);
    return;
  }

  const state = await loadGameState(gameId);
  if (!state) {
    console.log(`[Bot] Game ${gameId} not found`);
    return;
  }
  if (state.status !== "in-progress") {
    console.log(`[Bot] Game ${gameId} status is ${state.status}, skipping`);
    return;
  }
  if (state.turn !== playerId) {
    console.log(`[Bot] Not bot's turn (turn=${state.turn}), skipping`);
    return;
  }

  // ===== 1. اگر تاس نداریم =====
  if (!state.dice || state.dice.length === 0) {
    console.log(`[Bot] No dice, rolling...`);
    const dice = rollDiceUtil();
    await appendGameEvent(gameId, {
      type: "DICE_ROLLED",
      payload: { playerId, dice },
    });
    const newState = await loadGameState(gameId);
    if (newState) {
      rooms.broadcast(gameId, {
        type: "dice.result",
        payload: onOkSocketResponse({ dice, playerId, type: "inGame" }),
      });
      rooms.broadcast(gameId, {
        type: "game.state",
        payload: onOkSocketResponse(newState),
      });
    }
    setTimeout(() => runBotIfNeeded(gameId, playerId, rooms), 200);
    return;
  }

  // ===== 2. حرکات قانونی =====
  const sequences = generateMoveSequences(state, playerId);
  const moves = flattenMoveSequences(sequences);
  console.log(`[Bot] Legal moves count: ${moves.length}`);

  if (moves.length === 0) {
    console.log(`[Bot] No legal moves, passing turn`);
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
      // اگر نوبت جدید بات است، دوباره اجرا کن
      if (newState.turn === BOT_USER_ID) {
        console.log(`[Bot] Next turn is bot, scheduling again`);
        setTimeout(() => runBotIfNeeded(gameId, newState.turn!, rooms), 200);
      } else {
        console.log(`[Bot] Next turn is human (${newState.turn}), stopping`);
      }
    }
    return;
  }

  // ===== 3. انتخاب و اجرای حرکت =====
  const bestMove = moves[0];
  console.log(
    `[Bot] Trying move: from=${bestMove.from} to=${bestMove.to} die=${bestMove.die}`,
  );

  const validation = validateMove(state, playerId, bestMove.from, bestMove.to, [
    bestMove.die,
  ]);
  if (!validation.isValid) {
    console.warn(`[Bot] Invalid move: ${validation.message}, passing turn`);
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
      if (newState.turn === BOT_USER_ID) {
        setTimeout(() => runBotIfNeeded(gameId, newState.turn!, rooms), 200);
      }
    }
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

  const afterMove = await loadGameState(gameId);
  if (!afterMove) {
    console.error(`[Bot] Failed to load state after move`);
    return;
  }

  rooms.broadcast(gameId, {
    type: "player.move",
    payload: onOkSocketResponse([
      {
        playerId,
        from: bestMove.from,
        to: bestMove.to,
        die: bestMove.die,
        ownerId: playerId,
        isUndo: false,
      },
    ]),
  });
  rooms.broadcast(gameId, {
    type: "game.state",
    payload: onOkSocketResponse(afterMove),
  });

  // بررسی تاس‌های باقی‌مانده
  console.log(`[Bot] After move, dice left: ${afterMove.dice || []}`);

  if (afterMove.dice && afterMove.dice.length > 0) {
    // هنوز تاس باقی است → دوباره حرکت کن
    console.log(`[Bot] Still have dice, continuing`);
    setTimeout(() => runBotIfNeeded(gameId, playerId, rooms), 200);
  } else {
    // تاس تمام شد → نوبت را تمام کن
    console.log(`[Bot] No dice left, passing turn`);
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
      if (finalState.turn === BOT_USER_ID) {
        console.log(`[Bot] Next turn is bot, scheduling again`);
        setTimeout(() => runBotIfNeeded(gameId, finalState.turn!, rooms), 200);
      } else {
        console.log(`[Bot] Next turn is human (${finalState.turn}), stopping`);
      }
    }
  }
}
