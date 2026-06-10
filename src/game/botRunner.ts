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

/* -------------------------------------------------- */
/* Helpers */
/* -------------------------------------------------- */

function buildFullGameState(game: any) {
  const sequences =
    game.turn !== null ? generateMoveSequences(game, game.turn) : [];

  const legalMoves = flattenMoveSequences(sequences);

  return {
    ...game,
    subStatus: calculateSubStatus(game),
    legalMoves,
  };
}

function broadcastGameState(
  gameId: number,
  game: any,
  rooms: RoomManager,
  message?: string,
) {
  rooms.broadcast(gameId, {
    type: "game.state",
    payload: onOkSocketResponse(buildFullGameState(game), message),
  });
}

async function finishGameIfNeeded(
  gameId: number,
  game: any,
  playerId: PlayerId,
  rooms: RoomManager,
): Promise<boolean> {
  if (!isGameOver(game)) return false;

  const winType = calculateWinType(game, playerId);

  await appendGameEvent(gameId, {
    type: "GAME_FINISHED",
    payload: {
      winner: playerId,
      winType,
      reason: "REGULAR",
    },
  });

  const finished = await loadGameState(gameId);
  if (!finished) throw new Error("Failed to reload finished game");

  saveGame(finished);

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
      ...finished,
      subStatus: calculateSubStatus(finished),
      legalMoves: [],
    }),
  });

  return true;
}

async function passBotTurn(
  gameId: number,
  playerId: PlayerId,
  rooms: RoomManager,
) {
  await appendGameEvent(gameId, {
    type: "TURN_PASSED",
    payload: {
      playerId,
      reason: "NO_LEGAL_MOVES",
    },
  });

  const updated = await loadGameState(gameId);
  if (!updated) return;

  saveGame(updated);

  broadcastGameState(gameId, updated, rooms, "Bot turn passed");

  // اگر دوباره نوبت بات شد
  if (updated.status === "in-progress" && updated.turn === BOT_USER_ID) {
    setTimeout(() => {
      void runBotIfNeeded(gameId, BOT_USER_ID, rooms);
    }, 200);
  }
}

/* -------------------------------------------------- */
/* Main */
/* -------------------------------------------------- */

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

  /* --------------------------------------------- */
  /* 1️⃣ Roll dice if needed */
  /* --------------------------------------------- */

  if (!state.dice || state.dice.length === 0) {
    const dice = rollDiceUtil();

    await appendGameEvent(gameId, {
      type: "DICE_ROLLED",
      payload: { playerId, dice },
    });

    const updated = await loadGameState(gameId);
    if (!updated) return;

    saveGame(updated);

    rooms.broadcast(gameId, {
      type: "dice.result",
      payload: onOkSocketResponse({
        dice,
        playerId,
        type: "inGame",
      }),
    });

    broadcastGameState(gameId, updated, rooms);

    setTimeout(() => {
      void runBotIfNeeded(gameId, playerId, rooms);
    }, 200);

    return;
  }

  /* --------------------------------------------- */
  /* 2️⃣ Generate legal moves */
  /* --------------------------------------------- */

  const sequences = generateMoveSequences(state, playerId);
  const moves = flattenMoveSequences(sequences);

  if (moves.length === 0) {
    await passBotTurn(gameId, playerId, rooms);
    return;
  }

  /* --------------------------------------------- */
  /* 3️⃣ Pick move (basic AI) */
  /* --------------------------------------------- */

  const move = moves[0];

  const validation = validateMove(state, playerId, move.from, move.to, [
    move.die,
  ]);

  if (!validation.isValid) {
    await passBotTurn(gameId, playerId, rooms);
    return;
  }

  const opponentId = state.players.find((p) => p.id !== playerId)?.id;

  await appendGameEvent(gameId, {
    type: "MOVE_APPLIED",
    payload: validation.isHit
      ? {
          playerId,
          from: move.from,
          to: move.to,
          die: move.die,
          hitOpponentId: opponentId,
          hitFromPoint: move.to,
        }
      : {
          playerId,
          from: move.from,
          to: move.to,
          die: move.die,
        },
  });

  const afterMove = await loadGameState(gameId);
  if (!afterMove) return;

  saveGame(afterMove);

  /* --------------------------------------------- */
  /* 4️⃣ Broadcast player.move */
  /* --------------------------------------------- */

  const broadcastMoves: Array<{
    playerId: number;
    from: number;
    to: number;
    die: number;
    ownerId: number;
    isUndo?: boolean;
  }> = [
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

  /* --------------------------------------------- */
  /* 5️⃣ Check game over */
  /* --------------------------------------------- */

  if (await finishGameIfNeeded(gameId, afterMove, playerId, rooms)) {
    return;
  }

  broadcastGameState(gameId, afterMove, rooms);

  /* --------------------------------------------- */
  /* 6️⃣ Continue or end turn */
  /* --------------------------------------------- */

  if (afterMove.dice && afterMove.dice.length > 0) {
    const next = generateMoveSequences(afterMove, playerId);

    if (next.length > 0) {
      setTimeout(() => {
        void runBotIfNeeded(gameId, playerId, rooms);
      }, 200);
      return;
    }
  }

  await passBotTurn(gameId, playerId, rooms);
}
