import { GameState, PlayerId, SubStatus } from "./types";
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

import { createInitialGameState } from "./gameStore";
import { createInitialBoard } from "./board";
import { applyMove, switchTurn } from "./engine";
import { generateMoveSequences } from "./moveGenerator";

/**
 * این تابع تضمین می‌کنه که اگه ایونت جدیدی اضافه کردی و فراموش کردی
 * توی switch-case مدیریتش کنی، تایپ‌اسکریپت بهت ارور بده (Exhaustive Check).
 */
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
  };
};

export type DiceRolledEvent = {
  type: "DICE_ROLLED";
  payload: { playerId: PlayerId; dice: number[] };
};

export type MoveAppliedEvent = {
  type: "MOVE_APPLIED";
  payload: { playerId: PlayerId; from: number; to: number; die: number };
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
  | GameFinishedEvent;

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

/**
 * این تابع "حقیقت" بازی رو از روی ایونت‌ها می‌سازه.
 * هر تغییری در منطق بازی باید اینجا منعکس بشه.
 */
function applyEvent(state: GameState, event: GameEvent): GameState {
  // ثبت زمان آخرین تعامل برای مدیریت تایم‌اوت شبکه
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
      if (!state.startingDice) state.startingDice = {};
      state.startingDice[playerId] = value;
      return state;
    }

    case "GAME_STARTED": {
      const { whitePlayerId, blackPlayerId, startingPlayerId } = event.payload;
      state.status = "in-progress";
      state.turn = startingPlayerId;
      state.board = createInitialBoard(whitePlayerId, blackPlayerId);
      state.turnStartedAt = Date.now();
      return state;
    }

    case "DICE_ROLLED": {
      state.dice = event.payload.dice;
      state.turnStartedAt = Date.now();
      //  اینجا لازم نیست subStatus را ست کنیم، چون داینامیک حسابش می‌کنیم
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
      // بعد از حرکت، اگر تاس‌ها تمام شده باشند، در محاسبه داینامیک subStatus خودبخود به mustEndTurn می‌رویم
      return state;
    }

    case "TURN_PASSED": {
      switchTurn(state);
      state.dice = []; // مهم: تاس‌ها برای نفر بعدی باید خالی شوند
      state.turnStartedAt = Date.now();
      return state;
    }

    case "TURN_TIMEOUT":
    case "NETWORK_TIMEOUT": {
      // این ایونت‌ها صرفاً جهت ثبت در لاگ و تاریخچه هستند.
      // تغییر اصلی استیت توسط GAME_FINISHED که بلافاصله بعد از اینها میاد انجام میشه.
      return state;
    }

    case "GAME_FINISHED": {
      state.status = "finished";
      state.winner = event.payload.winner;
      state.winType = event.payload.winType;
      state.turn = null;
      return state;
    }

    default:
      return assertNever(event);
  }
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

export async function loadGameState(gameId: number): Promise<GameState | null> {
  const snapshot = await prismaGameSnapshotGetLast(gameId);
  let state: GameState;
  let sequence = 0;

  if (isSnapshotRow(snapshot)) {
    state = snapshot.state as unknown as GameState;
    sequence = snapshot.sequence;
  } else {
    state = createInitialGameState(gameId);
  }

  const events = await prismaGameEventGetAfterSequence({ gameId, sequence });

  for (const row of events) {
    if (!isEventRow(row)) continue;
    //  cast کردن به هر ایونتی اینجا لازمه چون از دیتابیس میاد
    state = applyEvent(state, { type: row.type, payload: row.payload } as any);
  }

  return state;
}

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

  if (!created || (created as any).errorType) {
    throw new Error(`Failed to append event: ${JSON.stringify(created)}`);
  }

  // مکانیسم Snapshotting برای بهینه‌سازی سرعت Load در بازی‌های طولانی
  // منطق اسنپ‌شات (هر ۲۰ ایونت یکبار)
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

export async function loadGameStateUntil(
  gameId: number,
  untilSequence?: number,
): Promise<GameState | null> {
  const snapshot = await prismaGameSnapshotGetLast(gameId);
  let state: GameState;
  let sequence = 0;

  if (isSnapshotRow(snapshot)) {
    state = snapshot.state as unknown as GameState;
    sequence = snapshot.sequence;
  } else {
    state = createInitialGameState(gameId);
  }

  const events = await prismaGameEventGetAfterSequence({
    gameId,
    sequence,
    untilSequence,
  });
  if (!events) return null;

  for (const row of events) {
    if (!isEventRow(row)) continue;
    state = applyEvent(state, { type: row.type, payload: row.payload } as any);
  }

  return state;
}

export function calculateSubStatus(state: GameState): SubStatus {
  if (state.status !== "in-progress" || !state.turn) return "waitingRoll";

  // ۱. اگر تاسی ریخته نشده باشد (یا آرایه خالی باشد)
  if (!state.dice || state.dice.length === 0) {
    return "waitingRoll";
  }

  // ۲. اصلاح فراخوانی: متد تو فقط 2 ورودی می‌گیرد (game و playerId)
  // فایل moveGenerator.ts خط ۲۱ رو ببین، ورودی اول کل GameState است.
  const legalMoves = generateMoveSequences(state, state.turn);

  if (legalMoves && legalMoves.length > 0) {
    return "playDice";
  } else {
    // ۳. تاس هست ولی هیچ حرکت قانونی (حتی با ترکیب‌های مختلف) وجود ندارد
    return "mustEndTurn";
  }
}
