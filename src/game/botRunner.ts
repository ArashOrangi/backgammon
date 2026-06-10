// botRunner.ts (نسخه اصلاح شده نهایی با ارسال game.turn)

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

const BOT_ACTION_DELAY_MS = 50;

function broadcastGameState(
  gameId: number,
  game: any,
  rooms: RoomManager,
  message?: string,
) {
  let legalMoves: any[] = [];

  if (game.turn !== null && game.dice && game.dice.length > 0) {
    legalMoves = flattenMoveSequences(generateMoveSequences(game, game.turn));
  }

  const subStatus = calculateSubStatus(game);

  rooms.broadcast(gameId, {
    type: "game.state",
    payload: onOkSocketResponse(
      {
        ...game,
        subStatus,
        legalMoves,
      },
      message,
    ),
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
      // هیچ حرکت قانونی وجود ندارد → پایان نوبت
      await appendGameEvent(gameId, {
        type: "TURN_PASSED",
        payload: { playerId, reason: "NO_LEGAL_MOVES" },
      });
      state = await loadGameState(gameId);
      if (state) {
        saveGame(state);
        broadcastTurnChange(gameId, state, rooms);
        broadcastGameState(gameId, state, rooms, "Bot turn passed (no moves)");
      }
      break;
    }

    const move = moves[0];
    const opponentId = state.players.find((p) => p.id !== playerId)?.id;

    const validation = validateMove(state, playerId, move.from, move.to, [
      move.die,
    ]);

    if (!validation.isValid) {
      console.error(
        `[Bot] Invalid move: ${validation.message}. move=${JSON.stringify(move)}`,
      );
      await appendGameEvent(gameId, {
        type: "TURN_PASSED",
        payload: { playerId, reason: "NO_LEGAL_MOVES" },
      });
      state = await loadGameState(gameId);
      if (state) {
        saveGame(state);
        broadcastTurnChange(gameId, state, rooms);

        broadcastGameState(
          gameId,
          state,
          rooms,
          "Bot turn passed (invalid move)",
        );
      }
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
    if (!state) break;
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

  // ---------------------------------------------
  // 3️⃣ تاس تمام شده → تعویض نوبت
  // ---------------------------------------------
  const finalState = await loadGameState(gameId);
  const finalSubStatus = finalState
    ? calculateSubStatus(finalState)
    : undefined;

  if (
    finalState &&
    finalState.turn === playerId &&
    finalSubStatus === "mustEndTurn"
  ) {
    await appendGameEvent(gameId, {
      type: "TURN_PASSED",
      payload: { playerId, reason: "MANUAL_END" },
    });
    const afterPass = await loadGameState(gameId);
    if (afterPass) {
      saveGame(afterPass);
      broadcastTurnChange(gameId, afterPass, rooms); // ✅ اضافه شد

      broadcastGameState(
        gameId,
        afterPass,
        rooms,
        "Bot turn ended (no dice left)",
      );
    }
  }
}
