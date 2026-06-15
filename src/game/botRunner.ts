import {
  loadGameState,
  appendGameEvent,
  calculateSubStatus,
} from "./eventStore";
import { generateMoveSequences, flattenMoveSequences } from "./moveGenerator";
import { rollDice as rollDiceUtil } from "@/utils/dice";
import { validateMove } from "./ruleValidator";
import { PlayerId, SPECIAL_POSITIONS } from "./types";
import { RoomManager } from "@/socket/room-manager";
import { onOkSocketResponse } from "@/responses/response-builder";
import { BOT_USER_ID } from "@/static/statics";
import { saveGame } from "./gameStore";
import { isGameOver, calculateWinType } from "./engine";

const BOT_ACTION_DELAY_MS = 1500;

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

// تابع برای broadcast نوبت جدید (game.turn)
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

// تابع برای broadcast پایان نوبت (mustEndTurn)
function broadcastTurnEnd(
  gameId: number,
  game: any,
  rooms: RoomManager,
  message?: string,
) {
  const legalMoves: any[] = []; // در پایان نوبت هیچ حرکت قانونی نیست
  rooms.broadcast(gameId, {
    type: "game.state",
    payload: onOkSocketResponse(
      { ...game, subStatus: "mustEndTurn", legalMoves },
      message,
    ),
  });
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
  // 2️⃣ حلقه‌ی اجرای حرکت
  // ---------------------------------------------
  while (
    state &&
    state.turn === playerId &&
    state.dice &&
    state.dice.length > 0
  ) {
    const sequences = generateMoveSequences(state, playerId);
    const moves = flattenMoveSequences(sequences);

    if (moves.length === 0) {
      await appendGameEvent(gameId, {
        type: "TURN_PASSED",
        payload: { playerId, reason: "NO_LEGAL_MOVES" },
      });
      state = await loadGameState(gameId);
      if (state) {
        saveGame(state);
        broadcastTurnChange(gameId, state, rooms);
        // ارسال state با subStatus: "mustEndTurn"
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

    const move = moves[0];
    const opponentId = state.players.find((p) => p.id !== playerId)?.id;

    const validation = validateMove(state, playerId, move.from, move.to, [
      move.die,
    ]);

    if (!validation.isValid) {
      console.error(`[Bot] Invalid move: ${validation.message}`);
      await appendGameEvent(gameId, {
        type: "TURN_PASSED",
        payload: { playerId, reason: "NO_LEGAL_MOVES" },
      });
      const newState = await loadGameState(gameId);
      if (newState) {
        saveGame(newState);
        broadcastTurnChange(gameId, newState, rooms);
        // ارسال مستقیم state با subStatus: "mustEndTurn"
        rooms.broadcast(gameId, {
          type: "game.state",
          payload: onOkSocketResponse(
            { ...newState, subStatus: "mustEndTurn", legalMoves: [] },
            "Bot turn passed (invalid move)",
          ),
        });
      }
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
    if (!state) break;
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

    // بررسی پایان بازی
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

    // بعد از حرکت، state جدید را broadcast کن (subStatus توسط calculateSubStatus تعیین می‌شود)
    broadcastGameState(gameId, state, rooms);
  }

  // ---------------------------------------------
  // 3️⃣ تاس تمام شده (یا حرکت باقی نمانده) → تعویض نوبت (MANUAL_END)
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
