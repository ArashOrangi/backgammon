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
import { isGameOver, calculateGameScore, calculateWinType } from "./engine";
import { broadcastTimerStarted, resetWarningState } from "@/game/engine/timer";
import { sleep } from "@/components/sleep";
import { getProgressionUpdate } from "@/services/progression";
// ===== NEW IMPORTS =====
import { selectMove, calculateDelay } from "./bot/engine";
import { getSigmaFinal } from "./bot/config";
import { RoomType } from "@prisma/client";

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

// changesCode: تابع جدید برای ارسال game.turn و timer.started
function broadcastTurnAndTimer(gameId: number, game: any, rooms: RoomManager) {
  const nextPlayer = game.players.find((p: any) => p.id === game.turn);
  if (!nextPlayer) return;

  // ارسال game.turn
  rooms.broadcast(gameId, {
    type: "game.turn",
    payload: onOkSocketResponse({
      playerId: nextPlayer.id,
      color: nextPlayer.color,
    }),
  });

  // ارسال timer.started
  if (game.turn) {
    broadcastTimerStarted(
      gameId,
      game.turn,
      game.primaryTimePerTurn,
      game.secondaryTimeBank[game.turn] || 0,
      game.turnStartedAt!,
      rooms,
    );
  }
}

// ===== NEW: تابع امتیازدهی با موتور ارزیابی و نویز =====
// (تابع scoreMove قدیمی حذف می‌شود، به‌جای آن از selectMove استفاده می‌کنیم)

// ===== NEW: توابع کمکی =====
function getPlayerStreak(game: any, playerId: number): number {
  const player = game.players.find((p: any) => p.id === playerId);
  return player?.winStreak ?? 0;
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

// ========== تابع بررسی وجود حرکت ورودی از BAR با هر تاس ==========
function canEnterFromBarWithAnyDie(game: any, playerId: number): boolean {
  const barCount = game.board.bar[playerId] ?? 0;
  if (barCount === 0) return true; // اگر روی BAR نیست، نیازی به ورود نیست

  const player = game.players.find((p: any) => p.id === playerId);
  if (!player) return false;

  const isWhite = player.color === "white";
  for (let die = 1; die <= 6; die++) {
    const to = isWhite ? 24 - die : die - 1;
    const point = game.board.points[to];
    if (!point) continue;
    // اگر نقطه خالی باشد یا مال خود بازیکن باشد یا یک مهره حریف داشته باشد (قابل زدن)
    if (point.owner === null || point.owner === playerId) return true;
    if (point.owner !== playerId && point.count === 1) return true;
    // در غیر این صورت بلاک است (2 یا بیشتر)
  }
  return false;
}

// ============================================================
// ===== MAIN EXPORT =====
// ============================================================
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
    // ✅ بررسی کنید که آیا بازیکن روی BAR است و هیچ حرکت ورودی با هیچ تاسی ممکن نیست
    if (!canEnterFromBarWithAnyDie(state, playerId)) {
      // بدون ریختن تاس، نوبت را بگذران
      await appendGameEvent(gameId, {
        type: "TURN_PASSED",
        payload: { playerId, reason: "NO_LEGAL_MOVES" },
      });
      const afterPass = await loadGameState(gameId);
      if (afterPass) {
        saveGame(afterPass);
        resetWarningState(gameId);
        broadcastTurnAndTimer(gameId, afterPass, rooms);
        rooms.broadcast(gameId, {
          type: "game.state",
          payload: onOkSocketResponse(
            { ...afterPass, subStatus: "mustEndTurn", legalMoves: [] },
            "Bot turn passed (no bar entry)",
          ),
        });
      }
      return;
    }

    // در غیر این صورت، تاس ریخته شود
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

    await sleep(1500);
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
        resetWarningState(gameId);
        broadcastTurnAndTimer(gameId, state, rooms);
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

    // ==== NEW: استفاده از موتور ارزیابی جدید با نویز و تأخیر ====
    // 1. محاسبه σ_final بر اساس roomType و winStreak بازیکن
    // ===== محاسبه σ_final =====
    const roomType = state.roomType as RoomType | undefined;
    if (!roomType) {
      console.warn(
        `[BotRunner] No roomType for game ${gameId}, using ROOM1 as fallback`,
      );
      // در صورت نیاز می‌توانید roomType را از دیتابیس یا preset بخوانید
    }
    const playerStreak = getPlayerStreak(state, playerId);
    const sigma = getSigmaFinal(roomType || RoomType.ROOM1, playerStreak);

    // 2. انتخاب بهترین دنباله با موتور جدید (جایگزین حلقه scoreMove)
    const bestSequence = selectMove(state, playerId, sigma);
    if (!bestSequence || bestSequence.moves.length === 0) {
      // اگر هیچ حرکتی انتخاب نشد (خطا)، نوبت را رد کن
      await appendGameEvent(gameId, {
        type: "TURN_PASSED",
        payload: { playerId, reason: "NO_LEGAL_MOVES" },
      });
      state = await loadGameState(gameId);
      if (state) {
        saveGame(state);
        resetWarningState(gameId);
        broadcastTurnAndTimer(gameId, state, rooms);
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

    // 3. محاسبه تأخیر مصنوعی
    const delay = calculateDelay(sequences, "move");
    await sleep(delay);

    // 4. اعمال حرکات انتخاب‌شده (دقیقاً مثل قبل)
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
        const score = calculateGameScore(state, winType);
        await appendGameEvent(gameId, {
          type: "GAME_FINISHED",
          payload: { winner: playerId, winType, reason: "REGULAR", score },
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
              score,
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

          // ===== NEW: Send progression update for bot match =====
          try {
            const progression = await getProgressionUpdate(playerId, gameId);
            if (progression) {
              rooms.broadcast(gameId, {
                type: "progression.updated",
                payload: onOkSocketResponse(
                  progression,
                  "Progression updated after bot match",
                ),
              });
            }
          } catch (err) {
            console.error(
              "[BotRunner] Failed to send progression update:",
              err,
            );
          }
          // =====================================================
        }
        return;
      }
      broadcastGameState(gameId, state, rooms);
    }
    if (!moveSuccess) break; // اگر دنباله ناقص ماند، نوبت را تمام کن
  }

  // پایان نوبت (دقیقاً مثل قبل)
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
      resetWarningState(gameId);
      broadcastTurnAndTimer(gameId, afterPass, rooms);
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
