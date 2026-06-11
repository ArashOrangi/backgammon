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

const BOT_ACTION_DELAY_MS = 900;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBearOffPosition(pos: number) {
  return (
    pos === SPECIAL_POSITIONS.BEAR_OFF_WHITE ||
    pos === SPECIAL_POSITIONS.BEAR_OFF_BLACK
  );
}

function getExpectedBearOffByColor(color?: string) {
  if (color === "white") return SPECIAL_POSITIONS.BEAR_OFF_WHITE;
  if (color === "black") return SPECIAL_POSITIONS.BEAR_OFF_BLACK;
  return null;
}

function getBorneOff(game: any, playerId: PlayerId) {
  return game?.board?.borneOff?.[playerId] ?? 0;
}

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

  console.log("[BOT_BROADCAST_GAME_STATE]", {
    gameId,
    turn: game.turn,
    dice: game.dice,
    subStatus,
    legalMovesCount: legalMoves.length,
    message,
  });

  rooms.broadcast(gameId, {
    type: "game.state",
    payload: onOkSocketResponse({ ...game, subStatus, legalMoves }, message),
  });
}

// تابع برای broadcast نوبت جدید (game.turn)
function broadcastTurnChange(gameId: number, game: any, rooms: RoomManager) {
  const nextPlayer = game.players.find((p: any) => p.id === game.turn);

  if (!nextPlayer) {
    console.warn("[BOT_BROADCAST_TURN_CHANGE_SKIPPED]", {
      gameId,
      reason: "NEXT_PLAYER_NOT_FOUND",
      turn: game.turn,
    });
    return;
  }

  console.log("[BOT_BROADCAST_TURN_CHANGE]", {
    gameId,
    playerId: nextPlayer.id,
    color: nextPlayer.color,
  });

  rooms.broadcast(gameId, {
    type: "game.turn",
    payload: onOkSocketResponse({
      playerId: nextPlayer.id,
      color: nextPlayer.color,
    }),
  });
}

// تابع برای broadcast پایان نوبت (mustEndTurn)
// نکته: برای bot بعد از TURN_PASSED نباید از این استفاده شود.
// چون بعد از TURN_PASSED نوبت واقعاً عوض شده و mustEndTurn باعث loop/desync در Unity می‌شود.
function broadcastTurnEnd(
  gameId: number,
  game: any,
  rooms: RoomManager,
  message?: string,
) {
  const legalMoves: any[] = []; // در پایان نوبت هیچ حرکت قانونی نیست

  console.warn("[BOT_BROADCAST_TURN_END_MUST_END_TURN]", {
    gameId,
    turn: game.turn,
    dice: game.dice,
    subStatus: "mustEndTurn",
    message,
  });

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

  console.log("[BOT_RUN_REQUESTED]", {
    gameId,
    playerId,
  });

  const getValidState = async () => {
    const state = await loadGameState(gameId);

    if (!state) {
      console.warn("[BOT_GET_VALID_STATE_FAILED]", {
        gameId,
        playerId,
        reason: "STATE_NOT_FOUND",
      });
      return null;
    }

    if (state.status !== "in-progress") {
      console.warn("[BOT_GET_VALID_STATE_FAILED]", {
        gameId,
        playerId,
        reason: "GAME_NOT_IN_PROGRESS",
        status: state.status,
      });
      return null;
    }

    if (state.turn !== playerId) {
      console.warn("[BOT_GET_VALID_STATE_FAILED]", {
        gameId,
        playerId,
        reason: "NOT_BOT_TURN",
        currentTurn: state.turn,
      });
      return null;
    }

    return state;
  };

  let state = await getValidState();
  if (!state) return;

  const botPlayer = state.players.find((p: any) => p.id === playerId);

  console.log("[BOT_START]", {
    gameId,
    playerId,
    color: botPlayer?.color,
    turn: state.turn,
    dice: state.dice,
    subStatus: calculateSubStatus(state),
    borneOff: getBorneOff(state, playerId),
  });

  // ---------------------------------------------
  // 1️⃣ ریختن تاس در صورت نیاز
  // ---------------------------------------------
  if (!state.dice || state.dice.length === 0) {
    const dice = rollDiceUtil();

    console.log("[BOT_ROLL_DICE]", {
      gameId,
      playerId,
      dice,
    });

    await appendGameEvent(gameId, {
      type: "DICE_ROLLED",
      payload: { playerId, dice },
    });

    await sleep(BOT_ACTION_DELAY_MS);

    state = await loadGameState(gameId);

    if (!state || state.turn !== playerId) {
      console.warn("[BOT_AFTER_ROLL_STATE_INVALID]", {
        gameId,
        playerId,
        stateExists: !!state,
        currentTurn: state?.turn,
      });
      return;
    }

    console.log("[BOT_AFTER_ROLL]", {
      gameId,
      playerId,
      dice: state.dice,
      subStatus: calculateSubStatus(state),
    });

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
    const player = state.players.find((p: any) => p.id === playerId);
    const sequences = generateMoveSequences(state, playerId);
    const moves = flattenMoveSequences(sequences);

    console.log("[BOT_MOVE_LOOP]", {
      gameId,
      playerId,
      color: player?.color,
      turn: state.turn,
      dice: state.dice,
      sequencesCount: sequences.length,
      movesCount: moves.length,
      subStatus: calculateSubStatus(state),
      borneOff: getBorneOff(state, playerId),
    });

    if (moves.length === 0) {
      console.warn("[BOT_NO_LEGAL_MOVES_PASSING_TURN]", {
        gameId,
        playerId,
        color: player?.color,
        dice: state.dice,
        subStatusBeforePass: calculateSubStatus(state),
      });

      await appendGameEvent(gameId, {
        type: "TURN_PASSED",
        payload: { playerId, reason: "NO_LEGAL_MOVES" },
      });

      state = await loadGameState(gameId);

      if (state) {
        saveGame(state);

        console.log("[BOT_AFTER_PASS_NO_LEGAL_MOVES]", {
          gameId,
          playerId,
          newTurn: state.turn,
          dice: state.dice,
          subStatusAfterPass: calculateSubStatus(state),
        });

        broadcastTurnChange(gameId, state, rooms);

        // مهم:
        // قبلاً اینجا subStatus: "mustEndTurn" ارسال می‌شد.
        // بعد از TURN_PASSED نوبت واقعاً عوض شده، پس mustEndTurn باعث loop/desync در Unity می‌شود.
        broadcastGameState(gameId, state, rooms, "Bot turn passed (no moves)");
      }

      break;
    }

    const move = moves[0];
    const opponentId = state.players.find((p: any) => p.id !== playerId)?.id;

    const isBearOff = isBearOffPosition(move.to);
    const expectedBearOff = getExpectedBearOffByColor(player?.color);

    console.log("[BOT_SELECTED_MOVE]", {
      gameId,
      playerId,
      color: player?.color,
      from: move.from,
      to: move.to,
      die: move.die,
      isBearOff,
      expectedBearOff,
      isExpectedBearOff:
        !isBearOff || expectedBearOff === null
          ? null
          : move.to === expectedBearOff,
      diceBefore: state.dice,
      borneOffBefore: getBorneOff(state, playerId),
    });

    if (isBearOff && expectedBearOff !== null && move.to !== expectedBearOff) {
      console.warn("[BOT_BEAR_OFF_SENTINEL_MISMATCH]", {
        gameId,
        playerId,
        color: player?.color,
        from: move.from,
        to: move.to,
        die: move.die,
        expectedBearOff,
        BEAR_OFF_WHITE: SPECIAL_POSITIONS.BEAR_OFF_WHITE,
        BEAR_OFF_BLACK: SPECIAL_POSITIONS.BEAR_OFF_BLACK,
      });
    }

    const validation = validateMove(state, playerId, move.from, move.to, [
      move.die,
    ]);

    console.log("[BOT_MOVE_VALIDATION]", {
      gameId,
      playerId,
      from: move.from,
      to: move.to,
      die: move.die,
      isValid: validation.isValid,
      message: validation.message,
      isHit: validation.isHit,
      dieUsed: validation.dieUsed,
      isBearOff,
    });

    if (!validation.isValid) {
      console.error("[BOT_INVALID_MOVE_PASSING_TURN]", {
        gameId,
        playerId,
        color: player?.color,
        from: move.from,
        to: move.to,
        die: move.die,
        dice: state.dice,
        message: validation.message,
        subStatusBeforePass: calculateSubStatus(state),
      });

      await appendGameEvent(gameId, {
        type: "TURN_PASSED",
        payload: { playerId, reason: "NO_LEGAL_MOVES" },
      });

      const newState = await loadGameState(gameId);

      if (newState) {
        saveGame(newState);

        console.log("[BOT_AFTER_PASS_INVALID_MOVE]", {
          gameId,
          playerId,
          newTurn: newState.turn,
          dice: newState.dice,
          subStatusAfterPass: calculateSubStatus(newState),
        });

        broadcastTurnChange(gameId, newState, rooms);

        // مهم:
        // قبلاً اینجا subStatus: "mustEndTurn" ارسال می‌شد.
        // بعد از TURN_PASSED باید state عادی ارسال شود.
        broadcastGameState(
          gameId,
          newState,
          rooms,
          "Bot turn passed (invalid move)",
        );
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

    console.log("[BOT_APPLY_MOVE_EVENT]", {
      gameId,
      movePayload,
      isBearOff,
      borneOffBefore: getBorneOff(state, playerId),
      diceBefore: state.dice,
    });

    await appendGameEvent(gameId, {
      type: "MOVE_APPLIED",
      payload: movePayload,
    });

    await sleep(BOT_ACTION_DELAY_MS);

    state = await loadGameState(gameId);

    if (!state) {
      console.warn("[BOT_AFTER_MOVE_STATE_NOT_FOUND]", {
        gameId,
        playerId,
      });
      break;
    }

    saveGame(state);

    console.log("[BOT_AFTER_MOVE_APPLIED]", {
      gameId,
      playerId,
      from: move.from,
      to: move.to,
      die: move.die,
      isBearOff,
      diceAfter: state.dice,
      borneOffAfter: getBorneOff(state, playerId),
      subStatusAfterMove: calculateSubStatus(state),
      turnAfterMove: state.turn,
    });

    if (isBearOff) {
      console.log("[BOT_BEAR_OFF_RESULT]", {
        gameId,
        playerId,
        color: player?.color,
        from: move.from,
        to: move.to,
        die: move.die,
        expectedBearOff,
        borneOffBefore: getBorneOff(
          {
            board: {
              borneOff: {
                [playerId]:
                  getBorneOff(state, playerId) > 0
                    ? getBorneOff(state, playerId) - 1
                    : 0,
              },
            },
          },
          playerId,
        ),
        borneOffAfter: getBorneOff(state, playerId),
      });
    }

    // پخش حرکت
    // ساختار array حفظ شده، فقط isUndo:false اضافه شده.
    const broadcastMoves = [
      {
        playerId,
        from: move.from,
        to: move.to,
        die: move.die,
        ownerId: playerId,
        isUndo: false,
      },
    ];

    if (validation.isHit && opponentId) {
      broadcastMoves.push({
        playerId: opponentId,
        from: move.to,
        to: SPECIAL_POSITIONS.BAR,
        die: 0,
        ownerId: opponentId,
        isUndo: false,
      });
    }

    console.log("[BOT_BROADCAST_PLAYER_MOVE]", {
      gameId,
      type: "player.move",
      payloadShape: "array",
      movesCount: broadcastMoves.length,
      moves: broadcastMoves,
      isBearOff,
      BAR: SPECIAL_POSITIONS.BAR,
      BEAR_OFF_WHITE: SPECIAL_POSITIONS.BEAR_OFF_WHITE,
      BEAR_OFF_BLACK: SPECIAL_POSITIONS.BEAR_OFF_BLACK,
    });

    rooms.broadcast(gameId, {
      type: "player.move",
      payload: onOkSocketResponse(broadcastMoves),
    });

    // بررسی پایان بازی
    if (isGameOver(state)) {
      const winType = calculateWinType(state, playerId);

      console.log("[BOT_GAME_OVER_DETECTED]", {
        gameId,
        playerId,
        winType,
        borneOff: getBorneOff(state, playerId),
      });

      await appendGameEvent(gameId, {
        type: "GAME_FINISHED",
        payload: { winner: playerId, winType, reason: "REGULAR" },
      });

      const final = await loadGameState(gameId);

      if (final) {
        saveGame(final);

        console.log("[BOT_GAME_FINISHED_BROADCAST]", {
          gameId,
          winner: playerId,
          winType,
          reason: "REGULAR",
          finalStatus: final.status,
          finalSubStatus: calculateSubStatus(final),
        });

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

  console.log("[BOT_FINAL_TURN_CHECK]", {
    gameId,
    playerId,
    stateExists: !!finalState,
    turn: finalState?.turn,
    dice: finalState?.dice,
    subStatus: finalState ? calculateSubStatus(finalState) : null,
  });

  if (finalState && finalState.turn === playerId) {
    console.log("[BOT_MANUAL_END_PASSING_TURN]", {
      gameId,
      playerId,
      dice: finalState.dice,
      subStatusBeforePass: calculateSubStatus(finalState),
    });

    await appendGameEvent(gameId, {
      type: "TURN_PASSED",
      payload: { playerId, reason: "MANUAL_END" },
    });

    const afterPass = await loadGameState(gameId);

    if (afterPass) {
      saveGame(afterPass);

      console.log("[BOT_AFTER_PASS_MANUAL_END]", {
        gameId,
        playerId,
        newTurn: afterPass.turn,
        dice: afterPass.dice,
        subStatusAfterPass: calculateSubStatus(afterPass),
      });

      broadcastTurnChange(gameId, afterPass, rooms);

      // مهم:
      // قبلاً اینجا subStatus: "mustEndTurn" ارسال می‌شد.
      // بعد از TURN_PASSED نوبت عوض شده و state باید عادی broadcast شود.
      broadcastGameState(
        gameId,
        afterPass,
        rooms,
        "Bot turn ended (no dice left)",
      );
    }
  }
}
