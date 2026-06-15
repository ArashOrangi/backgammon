import {
  loadGameState,
  appendGameEvent,
  calculateSubStatus,
} from "./eventStore";
import {
  generateMoveSequences,
  flattenMoveSequences,
  MoveSequence,
} from "./moveGenerator";
import { rollDice as rollDiceUtil } from "@/utils/dice";
import { validateMove, getHomeRange } from "./ruleValidator";
import { PlayerId, SPECIAL_POSITIONS } from "./types";
import { RoomManager } from "@/socket/room-manager";
import { onOkSocketResponse } from "@/responses/response-builder";
import { BOT_USER_ID } from "@/static/statics";
import { saveGame } from "./gameStore";
import { isGameOver, calculateWinType } from "./engine";

const BOT_ACTION_DELAY_MS = 1600;

function broadcastGameState(
  gameId: number,
  game: any,
  rooms: RoomManager,
  message?: string,
) {
  let legalMoves: any[] = [];
  if (game.turn !== null && game.dice?.length > 0) {
    legalMoves = flattenMoveSequences(generateMoveSequences(game, game.turn));
  }
  const subStatus = calculateSubStatus(game);
  rooms.broadcast(gameId, {
    type: "game.state",
    payload: onOkSocketResponse({ ...game, subStatus, legalMoves }, message),
  });
}

function broadcastTurnChange(gameId: number, game: any, rooms: RoomManager) {
  const nextPlayer = game.players.find((p: any) => p.id === game.turn);
  if (!nextPlayer) return;
  rooms.broadcast(gameId, {
    type: "game.turn",
    payload: onOkSocketResponse({
      playerId: nextPlayer.id,
      color: nextPlayer.color,
    }),
  });
}

// ========== تابع امتیازدهی ساده برای انتخاب بهترین حرکت ==========
function scoreMove(
  game: any,
  playerId: number,
  from: number,
  to: number,
  die: number,
): number {
  let score = 0;
  const player = game.players.find((p: any) => p.id === playerId);
  if (!player) return 0;
  const dir = player.color === "white" ? -1 : 1;

  // 1. خوردن مهره حریف (hit)
  if (
    to !== SPECIAL_POSITIONS.BAR &&
    game.board.points[to]?.owner &&
    game.board.points[to].owner !== playerId &&
    game.board.points[to].count === 1
  ) {
    score += 100;
  }

  // 2. bear off
  if (
    to === SPECIAL_POSITIONS.BEAR_OFF_WHITE ||
    to === SPECIAL_POSITIONS.BEAR_OFF_BLACK
  ) {
    score += 50;
    const distance = dir === -1 ? from + 1 : 24 - from;
    score += (7 - distance) * 2; // مهره دورتر اولویت بیشتری برای خروج دارد
  }

  // 3. حرکت به سمت خانه خودی
  const [homeStart, homeEnd] = getHomeRange(game, playerId);
  if (to >= homeStart && to <= homeEnd) {
    score += 10;
  }

  // 4. ساختن بلاک (حداقل ۲ مهره)
  const targetPoint = game.board.points[to];
  if (targetPoint && targetPoint.owner === playerId) {
    const newCount = (targetPoint.count || 0) + 1;
    if (newCount >= 2) score += 15;
  }

  return score;
}

// ========== اعتبارسنجی اضافی برای bear off با تاس بزرگتر ==========
function isHigherDieBearOffLegal(
  game: any,
  playerId: PlayerId,
  from: number,
  to: number,
  die: number,
): boolean {
  if (
    to !== SPECIAL_POSITIONS.BEAR_OFF_WHITE &&
    to !== SPECIAL_POSITIONS.BEAR_OFF_BLACK
  )
    return true;
  const player = game.players.find((p: any) => p.id === playerId);
  if (!player) return false;
  const dir = player.color === "white" ? -1 : 1;
  const distance = dir === -1 ? from + 1 : 24 - from;
  if (die <= distance) return true;

  const [start, end] = getHomeRange(game, playerId);
  const points = game.board.points;

  if (dir === -1) {
    // سفید
    for (let i = from + 1; i <= end; i++) {
      if (points[i].owner === playerId && points[i].count > 0) return false;
    }
  } else {
    // سیاه
    for (let i = start; i < from; i++) {
      if (points[i].owner === playerId && points[i].count > 0) return false;
    }
  }
  return true;
}

export async function runBotIfNeeded(
  gameId: number,
  playerId: PlayerId,
  rooms: RoomManager,
) {
  if (playerId !== BOT_USER_ID) return;

  const getValidState = async () => {
    const state = await loadGameState(gameId);
    if (!state || state.status !== "in-progress" || state.turn !== playerId)
      return null;
    return state;
  };

  let state = await getValidState();
  if (!state) return;

  // ریختن تاس در صورت نیاز
  if (!state.dice || state.dice.length === 0) {
    const dice = rollDiceUtil();
    await appendGameEvent(gameId, {
      type: "DICE_ROLLED",
      payload: { playerId, dice },
    });
    await new Promise((resolve) => setTimeout(resolve, BOT_ACTION_DELAY_MS));

    state = await loadGameState(gameId);
    if (!state || state.turn !== playerId) return;

    rooms.broadcast(gameId, {
      type: "dice.result",
      payload: onOkSocketResponse({ dice, playerId, type: "inGame" }),
    });
    broadcastGameState(gameId, state, rooms);
  }

  // حلقه اجرای حرکت
  while (
    state &&
    state.turn === playerId &&
    state.dice &&
    state.dice.length > 0
  ) {
    const sequences = generateMoveSequences(state, playerId);

    if (sequences.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, BOT_ACTION_DELAY_MS));
      await appendGameEvent(gameId, {
        type: "TURN_PASSED",
        payload: { playerId, reason: "NO_LEGAL_MOVES" },
      });
      state = await loadGameState(gameId);
      if (state) {
        saveGame(state);
        broadcastTurnChange(gameId, state, rooms);
        rooms.broadcast(gameId, {
          type: "game.state",
          payload: onOkSocketResponse(
            { ...state, subStatus: "mustEndTurn", legalMoves: [] },
            "Bot turn passed (no moves)",
          ),
        });
      }
      break;
    }

    // انتخاب بهترین دنباله بر اساس مجموع امتیاز حرکات
    let bestSequence: MoveSequence | null = null;
    let bestScore = -Infinity;
    for (const seq of sequences) {
      let totalScore = 0;
      let valid = true;
      for (const move of seq.moves) {
        if (
          !isHigherDieBearOffLegal(
            state,
            playerId,
            move.from,
            move.to,
            move.die,
          )
        ) {
          valid = false;
          break;
        }
        totalScore += scoreMove(state, playerId, move.from, move.to, move.die);
      }
      if (valid && totalScore > bestScore) {
        bestScore = totalScore;
        bestSequence = seq;
      }
    }
    if (!bestSequence) bestSequence = sequences[0];
    const movesToApply = bestSequence.moves;

    let moveSuccess = true;
    for (const move of movesToApply) {
      state = await loadGameState(gameId);
      if (!state || state.turn !== playerId) {
        moveSuccess = false;
        break;
      }

      const opponentId = state.players.find((p) => p.id !== playerId)?.id;
      const validation = validateMove(state, playerId, move.from, move.to, [
        move.die,
      ]);
      if (
        !validation.isValid ||
        !isHigherDieBearOffLegal(state, playerId, move.from, move.to, move.die)
      ) {
        console.error(`[Bot] Invalid move: ${validation.message}`);
        moveSuccess = false;
        break;
      }

      const movePayload: any = {
        playerId,
        from: move.from,
        to: move.to,
        die: move.die,
      };
      if (validation.isHit && opponentId) {
        movePayload.hitOpponentId = opponentId;
        movePayload.hitFromPoint = move.to;
      }
      await appendGameEvent(gameId, {
        type: "MOVE_APPLIED",
        payload: movePayload,
      });
      await new Promise((resolve) => setTimeout(resolve, BOT_ACTION_DELAY_MS));

      state = await loadGameState(gameId);
      if (!state) {
        moveSuccess = false;
        break;
      }
      saveGame(state);

      const broadcastMoves = [
        {
          playerId,
          from: move.from,
          to: move.to,
          die: move.die,
          ownerId: playerId,
        },
      ];
      if (validation.isHit && opponentId) {
        broadcastMoves.push({
          playerId: opponentId,
          from: move.to,
          to: SPECIAL_POSITIONS.BAR,
          die: 0,
          ownerId: opponentId,
        });
      }
      rooms.broadcast(gameId, {
        type: "player.move",
        payload: onOkSocketResponse(broadcastMoves),
      });

      if (isGameOver(state)) {
        const winType = calculateWinType(state, playerId);
        await appendGameEvent(gameId, {
          type: "GAME_FINISHED",
          payload: { winner: playerId, winType, reason: "REGULAR" },
        });
        await new Promise((resolve) =>
          setTimeout(resolve, BOT_ACTION_DELAY_MS),
        );
        const final = await loadGameState(gameId);
        if (final) {
          saveGame(final);
          rooms.broadcast(gameId, {
            type: "game.result",
            payload: onOkSocketResponse({
              winner: playerId,
              winType,
              reason: "REGULAR",
            }),
          });
          rooms.broadcast(gameId, {
            type: "game.state",
            payload: onOkSocketResponse({
              ...final,
              subStatus: calculateSubStatus(final),
              legalMoves: [],
            }),
          });
        }
        return;
      }
      broadcastGameState(gameId, state, rooms);
    }
    if (!moveSuccess) break; // اگر دنباله ناقص ماند، نوبت را تمام کن
  }

  // پایان نوبت
  const finalState = await loadGameState(gameId);
  if (finalState && finalState.turn === playerId) {
    await new Promise((resolve) => setTimeout(resolve, BOT_ACTION_DELAY_MS));
    await appendGameEvent(gameId, {
      type: "TURN_PASSED",
      payload: { playerId, reason: "MANUAL_END" },
    });
    const afterPass = await loadGameState(gameId);
    if (afterPass) {
      saveGame(afterPass);
      broadcastTurnChange(gameId, afterPass, rooms);
      rooms.broadcast(gameId, {
        type: "game.state",
        payload: onOkSocketResponse(
          { ...afterPass, subStatus: "mustEndTurn", legalMoves: [] },
          "Bot turn ended",
        ),
      });
    }
  }
}
