import { GameState, PlayerInfo } from "./types";
import { $Enums, Prisma } from "@prisma/client";

import {
  prismaGameEventCreate,
  prismaGameEventGetAfterSequence,
  prismaGameEventGetLastSequence,
} from "../models/gameEvent";

import {
  prismaGameSnapshotCreate,
  prismaGameSnapshotGetLast,
} from "../models/gameSnapshot";

import { applyMove, switchTurn } from "./game.engine";
import { createInitialGameState } from "./game.store";
import { createInitialBoard } from "./board";

function assertNever(x: never): never {
  throw new Error(`Unknown event type: ${(x as any).type}`);
}

const SNAPSHOT_INTERVAL = 20;

/* -------------------------------------------------------------------------- */
/* Event Types                                                                */
/* -------------------------------------------------------------------------- */

type PlayerLeftEvent = {
  type: "PLAYER_LEFT";
  payload: {
    playerId: string;
  };
};

type MoveAppliedEvent = {
  type: "MOVE_APPLIED";
  payload: {
    playerId: string;
    from: number | "bar";
    to: number | "off";
  };
};

type GameFinishedEvent = {
  type: "GAME_FINISHED";
  payload: {
    winner: string;
    winType: string;
  };
};

export type PlayerJoinedEvent = {
  type: "PLAYER_JOINED";
  payload: {
    playerId: string;
    color: "white" | "black";
  };
};

export type GameStartingEvent = {
  type: "GAME_STARTING";
  payload: {};
};

export type StartingRolledEvent = {
  type: "STARTING_ROLLED";
  payload: {
    playerId: string;
    value: number;
  };
};

export type GameStartedEvent = {
  type: "GAME_STARTED";
  payload: {
    whitePlayerId: string;
    blackPlayerId: string;
    startingPlayerId: string;
  };
};

export type DiceRolledEvent = {
  type: "DICE_ROLLED";
  payload: {
    playerId: string;
    dice: number[];
  };
};

export type TurnPassedEvent = {
  type: "TURN_PASSED";
  payload: {
    playerId: string;
    reason: "NO_LEGAL_MOVES";
  };
};

// export type GameEvent =
//   | GameStartedEvent
//   | PlayerJoinedEvent
//   | PlayerLeftEvent
//   | DiceRolledEvent
//   | MoveAppliedEvent
//   | GameFinishedEvent;

export type GameEvent =
  | GameStartingEvent
  | StartingRolledEvent
  | GameStartedEvent
  | PlayerJoinedEvent
  | PlayerLeftEvent
  | DiceRolledEvent
  | TurnPassedEvent
  | MoveAppliedEvent
  | GameFinishedEvent;

/* -------------------------------------------------------------------------- */
/* ORM Type Guards                                                            */
/* -------------------------------------------------------------------------- */

function isSnapshotRow(value: unknown): value is {
  sequence: number;
  state: Prisma.JsonValue;
} {
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
/* Apply Event                                                                */
/* -------------------------------------------------------------------------- */

function applyEvent(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
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
      const { whitePlayerId, blackPlayerId, startingPlayerId } = event.payload;

      state.status = "in-progress";
      state.turn = startingPlayerId;
      state.board = createInitialBoard(whitePlayerId, blackPlayerId);

      return state;
    }

    case "PLAYER_JOINED": {
      const { playerId, color } = event.payload;

      if (!state.players.some((p) => p.id === playerId)) {
        const player: PlayerInfo = {
          id: playerId,
          color,
        };

        state.players.push(player);
      }

      return state;
    }

    case "PLAYER_LEFT": {
      const { playerId } = event.payload;

      state.players = state.players.filter((p) => p.id !== playerId);

      return state;
    }

    case "DICE_ROLLED": {
      state.dice = event.payload.dice;
      return state;
    }

    case "MOVE_APPLIED": {
      const { playerId, from, to } = event.payload;

      applyMove(state, playerId, from, to);
      return state;
    }

    case "TURN_PASSED": {
      switchTurn(state);
      return state;
    }

    case "GAME_FINISHED": {
      state.status = "finished";
      state.winner = event.payload.winner;
      state.winType = event.payload.winType as "normal" | "mars" | "backgammon";

      return state;
    }

    default:
      return assertNever(event);
  }
}

/* -------------------------------------------------------------------------- */
/* Load Game State                                                            */
/* -------------------------------------------------------------------------- */

export async function loadGameState(gameId: number): Promise<GameState | null> {
  const snapshot = await prismaGameSnapshotGetLast(gameId);

  let state: GameState;
  let sequence = 0;

  if (isSnapshotRow(snapshot)) {
    state = snapshot.state as unknown as GameState;
    sequence = snapshot.sequence;
  } else {
    state = createInitialGameState(String(gameId));
  }

  const events = await prismaGameEventGetAfterSequence({
    gameId,
    sequence,
  });

  for (const row of events) {
    if (!isEventRow(row)) continue;

    const event = {
      type: row.type,
      payload: row.payload,
    } as unknown as GameEvent;

    state = applyEvent(state, event);
  }

  return state;
}

/* -------------------------------------------------------------------------- */
/* Append Event                                                               */
/* -------------------------------------------------------------------------- */

export async function appendGameEvent(gameId: number, event: GameEvent) {
  const lastSequence = await prismaGameEventGetLastSequence(gameId);

  if (typeof lastSequence !== "number") return lastSequence;

  const nextSequence = lastSequence + 1;

  const created = await prismaGameEventCreate({
    gameId,
    sequence: nextSequence,
    type: event.type as $Enums.EVENTTYPE,
    payload: event.payload as Prisma.InputJsonValue,
  });

  if (nextSequence % SNAPSHOT_INTERVAL === 0) {
    const state = await loadGameState(gameId);

    if (state) {
      await prismaGameSnapshotCreate({
        gameId,
        sequence: nextSequence,
        state: state as unknown as Prisma.InputJsonValue,
      });
    }
  }

  return created;
}
