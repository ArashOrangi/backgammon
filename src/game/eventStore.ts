import { GameState, PlayerId, SubStatus } from "./types";
import { $Enums, Prisma } from "@prisma/client";

import {
  prismaGameEventCreate,
  prismaGameEventGetAfterSequence,
  prismaGameEventGetLastSequence,
  prismaGameEventMarkAsUndo,
} from "../models/gameEvent";

import {
  prismaGameSnapshotCreate,
  prismaGameSnapshotGetLast,
} from "../models/gameSnapshot";

import { createInitialGameState } from "./gameStore";
import { createInitialBoard } from "./board";
import { applyMove, switchTurn } from "./engine";
import { generateMoveSequences } from "./moveGenerator";
import { OrmState } from "@/models/enums";
import { prisma } from "@/components/prisma";

function assertNever(x: never): never {
  throw new Error(`Unhandled event type: ${(x as any).type}`);
}

const SNAPSHOT_INTERVAL = 20;

/* -------------------------------------------------------------------------- */
/* Event Types Definition                                                     */
/* -------------------------------------------------------------------------- */

export type PlayerJoinedEvent = {
  type: "PLAYER_JOINED";
  payload: { playerId: PlayerId; color: "white" | "black" };
};

export type PlayerLeftEvent = {
  type: "PLAYER_LEFT";
  payload: { playerId: PlayerId };
};

export type GameStartingEvent = {
  type: "GAME_STARTING";
  payload: {};
};

export type StartingRolledEvent = {
  type: "STARTING_ROLLED";
  payload: { playerId: PlayerId; value: number };
};

export type GameStartedEvent = {
  type: "GAME_STARTED";
  payload: {
    whitePlayerId: PlayerId;
    blackPlayerId: PlayerId;
    startingPlayerId: PlayerId;
    primarySeconds: number;
    secondarySeconds: number;
    dice: number[];
  };
};

export type DiceRolledEvent = {
  type: "DICE_ROLLED";
  payload: { playerId: PlayerId; dice: number[] };
};

export type MoveAppliedEvent = {
  type: "MOVE_APPLIED";
  payload: {
    playerId: PlayerId;
    from: number;
    to: number;
    die: number;
    isUndo?: boolean;
    hitOpponentId?: PlayerId;
    hitFromPoint?: number;
  };
};

export type TurnPassedEvent = {
  type: "TURN_PASSED";
  payload: {
    playerId: PlayerId;
    reason: "NO_LEGAL_MOVES" | "TIMEOUT" | "MANUAL_END";
  };
};

export type TurnTimeoutEvent = {
  type: "TURN_TIMEOUT";
  payload: { playerId: PlayerId };
};

export type NetworkTimeoutEvent = {
  type: "NETWORK_TIMEOUT";
  payload: { playerId: PlayerId };
};

export type GameFinishedEvent = {
  type: "GAME_FINISHED";
  payload: {
    winner: PlayerId;
    winType: "normal" | "mars" | "backgammon";
    reason: "REGULAR" | "TIMEOUT" | "DISCONNECT";
  };
};

export type PracticeBearOffSetupEvent = {
  type: "PRACTICE_BEAROFF_SETUP";
  payload: { playerId: PlayerId };
};

export type PracticeRearrangeEvent = {
  type: "PRACTICE_REARRANGE";
  payload: {
    playerId: PlayerId;
    points: Array<{ index: number; count: number }>;
  };
};

export type PracticeSetupBoardEvent = {
  type: "PRACTICE_SETUP_BOARD";
  payload: {
    playerId: PlayerId;
    board: {
      points: Array<{ owner: PlayerId | null; count: number }>;
      bar: Record<PlayerId, number>;
      borneOff: Record<PlayerId, number>;
    };
  };
};

export type GameEvent =
  | PlayerJoinedEvent
  | PlayerLeftEvent
  | GameStartingEvent
  | StartingRolledEvent
  | GameStartedEvent
  | DiceRolledEvent
  | MoveAppliedEvent
  | TurnPassedEvent
  | TurnTimeoutEvent
  | NetworkTimeoutEvent
  | GameFinishedEvent
  | PracticeBearOffSetupEvent
  | PracticeRearrangeEvent
  | PracticeSetupBoardEvent;

/* -------------------------------------------------------------------------- */
/* Type Guards                                                                */
/* -------------------------------------------------------------------------- */

function isSnapshotRow(
  value: unknown,
): value is { sequence: number; state: Prisma.JsonValue } {
  return (
    typeof value === "object" &&
    value !== null &&
    "state" in value &&
    "sequence" in value
  );
}

function isEventRow(value: unknown): value is {
  type: $Enums.EVENTTYPE;
  payload: Prisma.JsonValue;
  sequence: number;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "payload" in value &&
    "sequence" in value
  );
}

/* -------------------------------------------------------------------------- */
/* Apply Event (The Reducer Logic)                                            */
/* -------------------------------------------------------------------------- */

function applyEvent(state: GameState, event: GameEvent): GameState {
  state.lastActionAt = Date.now();

  switch (event.type) {
    case "PLAYER_JOINED": {
      const { playerId, color } = event.payload;

      if (!state.players.some((p) => p.id === playerId)) {
        state.players.push({ id: playerId, color });
      }

      return state;
    }

    case "PLAYER_LEFT": {
      state.players = state.players.filter(
        (p) => p.id !== event.payload.playerId,
      );

      return state;
    }

    case "GAME_STARTING": {
      state.status = "starting";
      return state;
    }

    case "STARTING_ROLLED": {
      const { playerId, value } = event.payload;

      if (!state.startingDice) {
        state.startingDice = {};
      }

      state.startingDice[playerId] = value;

      return state;
    }

    case "GAME_STARTED": {
      const {
        whitePlayerId,
        blackPlayerId,
        startingPlayerId,
        primarySeconds,
        secondarySeconds,
        dice,
      } = event.payload;

      state.status = "in-progress";
      state.turn = startingPlayerId;
      state.board = createInitialBoard(whitePlayerId, blackPlayerId);
      state.turnStartedAt = Date.now();
      state.primaryTimePerTurn = primarySeconds;
      state.secondaryTimeBank = {
        [whitePlayerId]: secondarySeconds,
        [blackPlayerId]: secondarySeconds,
      };
      state.dice = dice;
      state.rolledThisTurn = true;

      return state;
    }

    case "DICE_ROLLED": {
      state.dice = event.payload.dice;
      state.turnStartedAt = Date.now();
      state.rolledThisTurn = true;

      return state;
    }

    case "MOVE_APPLIED": {
      applyMove(
        state,
        event.payload.playerId,
        event.payload.from,
        event.payload.to,
        event.payload.die,
      );

      return state;
    }

    case "TURN_PASSED": {
      switchTurn(state);
      state.dice = [];
      state.turnStartedAt = Date.now();
      state.rolledThisTurn = false;

      return state;
    }

    case "TURN_TIMEOUT":
    case "NETWORK_TIMEOUT": {
      return state;
    }

    case "GAME_FINISHED": {
      state.status = "finished";
      state.winner = event.payload.winner;
      state.winType = event.payload.winType;
      state.turn = null;

      return state;
    }

    case "PRACTICE_BEAROFF_SETUP": {
      const { playerId } = event.payload;
      const player = state.players.find((p) => p.id === playerId);

      if (!player) return state;

      const homeIndices =
        player.color === "white"
          ? [0, 1, 2, 3, 4, 5]
          : [18, 19, 20, 21, 22, 23];

      const firstHome = homeIndices[0];

      for (let i = 0; i < 24; i++) {
        if (state.board.points[i].owner === playerId) {
          state.board.points[i].owner = null;
          state.board.points[i].count = 0;
        }
      }

      state.board.bar[playerId] = 0;
      state.board.borneOff[playerId] = 0;

      state.board.points[firstHome].owner = playerId;
      state.board.points[firstHome].count = 15;

      state.dice = [];
      state.rolledThisTurn = false;
      state.turn = playerId;
      state.turnStartedAt = Date.now();

      return state;
    }

    case "PRACTICE_REARRANGE": {
      const { playerId, points } = event.payload;
      const player = state.players.find((p) => p.id === playerId);

      if (!player) return state;

      for (let i = 0; i < 24; i++) {
        if (state.board.points[i].owner === playerId) {
          state.board.points[i].owner = null;
          state.board.points[i].count = 0;
        }
      }

      state.board.bar[playerId] = 0;
      state.board.borneOff[playerId] = 0;

      for (const { index, count } of points) {
        if (index >= 0 && index < 24 && count > 0) {
          state.board.points[index].owner = playerId;
          state.board.points[index].count = count;
        }
      }

      state.dice = [];
      state.rolledThisTurn = false;
      state.turn = playerId;
      state.turnStartedAt = Date.now();

      return state;
    }

    case "PRACTICE_SETUP_BOARD": {
      const { board } = event.payload;

      state.board.points = board.points.map((p) => ({ ...p }));
      state.board.bar = { ...board.bar };
      state.board.borneOff = { ...board.borneOff };
      state.dice = [];
      state.rolledThisTurn = false;
      state.turn = event.payload.playerId;
      state.turnStartedAt = Date.now();

      return state;
    }

    default:
      return assertNever(event);
  }
}

/* -------------------------------------------------------------------------- */
/* Internal Rebuild Helpers                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Rebuilds game state from the very beginning, ignoring snapshots.
 *
 * This is intentionally used after undo, because the latest snapshot may have
 * been created at the same sequence as the event that was just marked as undo.
 * If we load from that snapshot, we may accidentally keep the undone move in
 * the rebuilt state.
 */
async function rebuildGameStateFromScratch(
  gameId: number,
): Promise<GameState | null> {
  let state = await createInitialGameState(gameId);

  const events = await prismaGameEventGetAfterSequence({
    gameId,
    sequence: -1,
  });

  for (const row of events) {
    if (!isEventRow(row)) continue;

    state = applyEvent(state, {
      type: row.type,
      payload: row.payload,
    } as any);
  }

  return state;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export async function loadGameState(gameId: number): Promise<GameState | null> {
  const snapshot = await prismaGameSnapshotGetLast(gameId);

  let state: GameState;
  let sequence = -1;

  if (isSnapshotRow(snapshot)) {
    state = snapshot.state as unknown as GameState;
    sequence = snapshot.sequence;
  } else {
    state = await createInitialGameState(gameId);
  }

  const events = await prismaGameEventGetAfterSequence({
    gameId,
    sequence,
  });

  for (const row of events) {
    if (!isEventRow(row)) continue;

    state = applyEvent(state, {
      type: row.type,
      payload: row.payload,
    } as any);
  }

  return state;
}

export async function appendGameEvent(gameId: number, event: GameEvent) {
  const lastSequence = await prismaGameEventGetLastSequence(gameId);

  if (typeof lastSequence !== "number") {
    return lastSequence;
  }

  const nextSequence = lastSequence + 1;

  const created = await prismaGameEventCreate({
    gameId,
    sequence: nextSequence,
    type: event.type as $Enums.EVENTTYPE,
    payload: event.payload as Prisma.InputJsonValue,
  });

  if (!created || (created as any).errorType) {
    throw new Error(`Failed to append event: ${JSON.stringify(created)}`);
  }

  if (nextSequence % SNAPSHOT_INTERVAL === 0) {
    const state = await loadGameState(gameId);

    if (state) {
      await forceSnapshot(gameId, state);
    }
  }

  return created;
}

export async function loadGameStateUntil(
  gameId: number,
  untilSequence?: number,
): Promise<GameState | null> {
  const snapshot = await prismaGameSnapshotGetLast(gameId);

  let state: GameState;
  let sequence = -1;

  if (isSnapshotRow(snapshot)) {
    state = snapshot.state as unknown as GameState;
    sequence = snapshot.sequence;
  } else {
    state = await createInitialGameState(gameId);
  }

  const events = await prismaGameEventGetAfterSequence({
    gameId,
    sequence,
    untilSequence,
  });

  if (!events) return null;

  for (const row of events) {
    if (!isEventRow(row)) continue;

    state = applyEvent(state, {
      type: row.type,
      payload: row.payload,
    } as any);
  }

  return state;
}

// eventStore.ts

export function calculateSubStatus(state: GameState): SubStatus | undefined {
  if (state.status !== "in-progress" || !state.turn) {
    return undefined;
  }

  // اگر تاس وجود ندارد → نوبت تمام شده
  if (!state.dice || state.dice.length === 0) {
    return "mustEndTurn";
  }

  const legalMoves = generateMoveSequences(state, state.turn);
  const hasRealMove = legalMoves.some((seq) => seq.moves.length > 0);

  // اگر تاس دارد ولی هیچ حرکت قانونی ندارد → نوبت تمام شده
  if (!hasRealMove) {
    return "mustEndTurn";
  }

  return "playDice";
}

export async function undoLastMove(gameId: number, playerId: PlayerId) {
  console.log(`[undoLastMove] game=${gameId}, player=${playerId}`);

  const result = await prismaGameEventMarkAsUndo(gameId, playerId);

  if (result === OrmState.Error || !result) {
    return null;
  }

  /**
   * Important:
   *
   * Do NOT call loadGameState(gameId) here.
   *
   * The latest snapshot may already be at the same sequence as the event that
   * was just marked as undo. In that case, loadGameState() would load the stale
   * snapshot and skip replaying the changed event, keeping the undone move alive.
   */
  const newState = await rebuildGameStateFromScratch(gameId);

  if (newState) {
    await forceSnapshot(gameId, newState);
  }

  return (result as GameEvent).payload;
}

export async function forceSnapshot(gameId: number, state: GameState) {
  const lastSequence = await prismaGameEventGetLastSequence(gameId);

  if (typeof lastSequence !== "number") {
    return;
  }

  const existing = await prisma.gameSnapshots.findFirst({
    where: {
      gameId,
      sequence: lastSequence,
    },
  });

  if (existing) {
    await prisma.gameSnapshots.update({
      where: {
        id: existing.id,
      },
      data: {
        state: state as unknown as Prisma.InputJsonValue,
      },
    });

    return;
  }

  await prismaGameSnapshotCreate({
    gameId,
    sequence: lastSequence,
    state: state as unknown as Prisma.InputJsonValue,
  });
}
