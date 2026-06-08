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
  if (playerId !== BOT_USER_ID) return;

  const state = await loadGameState(gameId);
  if (!state) return;
  if (state.status !== "in-progress") return;
  if (state.turn !== playerId) return;

  // ===== 1. اگر تاس نداریم =====
  if (!state.dice || state.dice.length === 0) {
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
    // بعد از ریختن تاس، دوباره خود را فراخوانی کن (با تأخیر)
    setTimeout(() => runBotIfNeeded(gameId, playerId, rooms), 200);
    return;
  }

  // ===== 2. حرکات قانونی =====
  const sequences = generateMoveSequences(state, playerId);
  const moves = flattenMoveSequences(sequences);

  if (moves.length === 0) {
    console.log(`[Bot] No legal moves for player ${playerId}, passing turn`);
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
      // اگر نوبت جدید به بات رسید، دوباره اجرا کن
      if (newState.turn === BOT_USER_ID) {
        setTimeout(() => runBotIfNeeded(gameId, newState.turn!, rooms), 200);
      }
    }
    return;
  }

  // ===== 3. انتخاب و اجرای حرکت =====
  const bestMove = moves[0];
  const validation = validateMove(state, playerId, bestMove.from, bestMove.to, [
    bestMove.die,
  ]);
  if (!validation.isValid) {
    console.warn(`[Bot] Invalid move: ${validation.message}`);
    // اگر حرکت نامعتبر بود، شاید حرکات دیگری وجود داشته باشند؟ اما در حالت عادی نباید.
    // برای جلوگیری از قفل، نوبت را تمام می‌کنیم.
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
  if (afterMove) {
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

    // اگر هنوز تاس باقی است، دوباره خود را فراخوانی کن
    if (afterMove.dice && afterMove.dice.length > 0) {
      setTimeout(() => runBotIfNeeded(gameId, playerId, rooms), 200);
    } else {
      // اگر تاس تمام شد، نوبت را تمام کن
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
        // اگر نوبت جدید بات است، اجرا کن
        if (finalState.turn === BOT_USER_ID) {
          setTimeout(
            () => runBotIfNeeded(gameId, finalState.turn!, rooms),
            200,
          );
        }
      }
    }
  }
}
