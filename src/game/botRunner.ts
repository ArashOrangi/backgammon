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
import { validateMove, getHomeRange, canBearOff } from "./ruleValidator";
import { PlayerId, SPECIAL_POSITIONS } from "./types";
import { RoomManager } from "@/socket/room-manager";
import { onOkSocketResponse } from "@/responses/response-builder";
import { BOT_USER_ID } from "@/static/statics";
import { saveGame } from "./gameStore";
import { isGameOver, calculateWinType } from "./engine";

const BOT_ACTION_DELAY_MS = 900;

// تابع کمکی برای broadcast state عادی (با calculateSubStatus)
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

// ========== تابع بررسی اضافی برای bear-off با تاس بزرگتر ==========
function isHigherDieBearOffLegal(
  game: any,
  playerId: PlayerId,
  from: number,
  to: number,
  die: number,
): boolean {
  // فقط برای bear-off چک کن
  if (
    to !== SPECIAL_POSITIONS.BEAR_OFF_WHITE &&
    to !== SPECIAL_POSITIONS.BEAR_OFF_BLACK
  ) {
    return true;
  }
  const dir =
    game.players.find((p: any) => p.id === playerId)?.color === "white"
      ? -1
      : 1;
  const distance = dir === -1 ? from + 1 : 24 - from;
  if (die <= distance) return true; // تاس دقیق یا کوچک‌تر (کوچک‌تر مجاز نیست ولی اینجا نمی‌رسد)

  // die > distance : باید بررسی کنیم مهره عقب‌تر وجود نداشته باشد
  const [start, end] = getHomeRange(game, playerId);
  const points = game.board.points;

  if (dir === -1) {
    // سفید
    for (let i = from + 1; i <= end; i++) {
      if (points[i].owner === playerId && points[i].count > 0) {
        console.log(
          `[BOT] Higher die bear-off REJECTED: checker behind at ${i}`,
        );
        return false;
      }
    }
  } else {
    // سیاه
    for (let i = start; i < from; i++) {
      if (points[i].owner === playerId && points[i].count > 0) {
        console.log(
          `[BOT] Higher die bear-off REJECTED: checker behind at ${i}`,
        );
        return false;
      }
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

  // ---------------------------------------------
  // 1️⃣ ریختن تاس در صورت نیاز
  // ---------------------------------------------
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

  // ---------------------------------------------
  // 2️⃣ حلقه‌ی اجرای حرکت - به جای حرکت تکی، بهترین دنباله را انتخاب کن
  // ---------------------------------------------
  while (
    state &&
    state.turn === playerId &&
    state.dice &&
    state.dice.length > 0
  ) {
    const sequences = generateMoveSequences(state, playerId);

    if (sequences.length === 0) {
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

    // انتخاب بهترین دنباله: اولویت با بیشترین تعداد حرکت
    let bestSequence: MoveSequence = sequences[0];
    for (const seq of sequences) {
      if (seq.moves.length > bestSequence.moves.length) {
        bestSequence = seq;
      }
    }
    const movesToApply = bestSequence.moves;
    console.log(`[BOT] Selected sequence with ${movesToApply.length} moves`);

    let moveIndex = 0;
    let success = true;
    for (const move of movesToApply) {
      // قبل از هر حرکت، state را دوباره لود کن (ممکن است بین حرکات تغییر کند)
      state = await loadGameState(gameId);
      if (!state || state.turn !== playerId) {
        success = false;
        break;
      }

      const opponentId = state.players.find((p) => p.id !== playerId)?.id;

      // اعتبارسنجی اضافی برای bear-off با تاس بزرگتر
      if (
        !isHigherDieBearOffLegal(state, playerId, move.from, move.to, move.die)
      ) {
        console.log(
          `[BOT] Skipping illegal higher-die bear-off move: from=${move.from} to=${move.to} die=${move.die}`,
        );
        success = false;
        break;
      }

      const validation = validateMove(state, playerId, move.from, move.to, [
        move.die,
      ]);
      if (!validation.isValid) {
        console.error(`[BOT] Invalid move in sequence: ${validation.message}`);
        success = false;
        break;
      }

      // ثبت حرکت
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
        success = false;
        break;
      }
      saveGame(state);

      // پخش حرکت
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

      // بررسی پایان بازی بعد از هر حرکت
      if (isGameOver(state)) {
        const winType = calculateWinType(state, playerId);
        await appendGameEvent(gameId, {
          type: "GAME_FINISHED",
          payload: { winner: playerId, winType, reason: "REGULAR" },
        });
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
      moveIndex++;
    }

    if (!success) {
      // اگر دنباله ناقص اجرا شد، کل نوبت را بپرس (یا می‌توان ادامه داد)
      console.log(
        `[BOT] Sequence interrupted after ${moveIndex} moves. Ending turn.`,
      );
      break;
    }
  }

  // ---------------------------------------------
  // 3️⃣ تاس تمام شده یا حرکت باقی نمانده → تعویض نوبت
  // ---------------------------------------------
  const finalState = await loadGameState(gameId);
  if (finalState && finalState.turn === playerId) {
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
          "Bot turn ended (no dice left)",
        ),
      });
    }
  }
}
