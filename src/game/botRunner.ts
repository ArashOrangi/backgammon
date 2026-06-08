import { loadGameState, appendGameEvent } from "./eventStore";
import { generateMoveSequences, flattenMoveSequences } from "./moveGenerator";
import { rollDice as rollDiceUtil } from "@/utils/dice";
import { validateMove } from "./ruleValidator";
import { PlayerId } from "./types";
import { RoomManager } from "@/socket/room-manager";
import { onOkSocketResponse } from "@/responses/response-builder";
import { BOT_USER_ID } from "@/static/statics";
// اضافه کردن import برای handleEndTurn
import { handleEndTurn } from "@/socket/handlers/endTurn";
import { SocketContext } from "@/socket/socket-context";
import { WebSocket } from "ws";

// ساخت یک SocketContext ساختگی برای بات (فقط برای فراخوانی handleEndTurn)
function createBotSocketContext(playerId: number): SocketContext {
  const fakeWs = { send: () => {} } as unknown as WebSocket;
  const ctx = new SocketContext(fakeWs);
  ctx.userId = playerId;
  return ctx;
}

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
    setTimeout(() => runBotIfNeeded(gameId, playerId, rooms), 200);
    return;
  }

  // ===== 2. حرکات قانونی =====
  const sequences = generateMoveSequences(state, playerId);
  const moves = flattenMoveSequences(sequences);

  if (moves.length === 0) {
    // هیچ حرکت قانونی وجود ندارد → باید نوبت را تمام کند (مانند انسان)
    const ctx = createBotSocketContext(playerId);
    await handleEndTurn(ctx, { gameId }, rooms);
    return;
  }

  // ===== 3. انتخاب و اجرای حرکت =====
  const bestMove = moves[0];
  const validation = validateMove(state, playerId, bestMove.from, bestMove.to, [
    bestMove.die,
  ]);
  if (!validation.isValid) {
    // حرکت نامعتبر (نباید رخ دهد) → نوبت را تمام کن
    const ctx = createBotSocketContext(playerId);
    await handleEndTurn(ctx, { gameId }, rooms);
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

    // اگر هنوز تاس باقی است و حرکت قانونی وجود دارد، ادامه بده
    if (afterMove.dice && afterMove.dice.length > 0) {
      const nextSequences = generateMoveSequences(afterMove, playerId);
      if (nextSequences.length > 0) {
        setTimeout(() => runBotIfNeeded(gameId, playerId, rooms), 200);
      } else {
        // تاس باقی است ولی حرکت قانونی وجود ندارد → نوبت را تمام کن
        const ctx = createBotSocketContext(playerId);
        await handleEndTurn(ctx, { gameId }, rooms);
      }
    } else {
      // تاس تمام شد → نوبت را تمام کن
      const ctx = createBotSocketContext(playerId);
      await handleEndTurn(ctx, { gameId }, rooms);
    }
  }
}
