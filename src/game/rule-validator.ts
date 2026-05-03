import { GameState, PlayerId } from "./types";

/* -------------------------------------------------- */
/* 🧭 DIRECTION */
/* -------------------------------------------------- */

function getDirection(game: GameState, playerId: PlayerId): 1 | -1 {
  const player = game.players.find((p) => p.id === playerId);

  if (!player) {
    throw new Error("Unknown player");
  }

  return player.color === "white" ? -1 : 1;
}

/* -------------------------------------------------- */
/* 🏠 HOME BOARD RANGE */
/* -------------------------------------------------- */

function getHomeRange(game: GameState, playerId: PlayerId): [number, number] {
  const dir = getDirection(game, playerId);

  return dir === -1 ? [0, 5] : [18, 23];
}

/* -------------------------------------------------- */
/* ✅ CAN BEAR OFF */
/* -------------------------------------------------- */

export function canBearOff(game: GameState, playerId: PlayerId): boolean {
  const [start, end] = getHomeRange(game, playerId);
  const { points, bar } = game.board;

  if ((bar[playerId] ?? 0) > 0) return false;

  for (let i = 0; i < 24; i++) {
    const p = points[i];
    if (p.owner === playerId) {
      if (i < start || i > end) return false;
    }
  }

  return true;
}

/* -------------------------------------------------- */
/* 🚫 BLOCKED POINT */
/* -------------------------------------------------- */

function isPointBlocked(
  game: GameState,
  playerId: PlayerId,
  index: number,
): boolean {
  const p = game.board.points[index];

  if (!p.owner) return false;
  if (p.owner === playerId) return false;

  return p.count > 1;
}

/* -------------------------------------------------- */
/* 📏 DISTANCE */
/* -------------------------------------------------- */

function computeDistance(
  game: GameState,
  playerId: PlayerId,
  from: number | "bar",
  to: number | "off",
): number | null {
  const dir = getDirection(game, playerId);

  if (from === "bar") {
    const entry = dir === -1 ? 23 : 0;

    if (typeof to !== "number") return null;

    return dir === -1 ? entry - to : to - entry;
  }

  if (to === "off") {
    if (!canBearOff(game, playerId)) return null;

    if (dir === -1) {
      return from + 1;
    }

    return 24 - from;
  }

  if (typeof from === "number" && typeof to === "number") {
    return dir === -1 ? from - to : to - from;
  }

  return null;
}

/* -------------------------------------------------- */
/* 🎲 MATCHING DIE */
/* -------------------------------------------------- */

function findMatchingDie(game: GameState, distance: number): number | null {
  if (!game.dice) return null;

  const exact = game.dice.find((d) => d === distance);
  if (exact) return exact;

  return null;
}

/* -------------------------------------------------- */
/* 🎲 HIGHER DIE FOR BEAROFF */
/* -------------------------------------------------- */

function findHigherDieForBearOff(
  game: GameState,
  playerId: PlayerId,
  from: number,
  distance: number,
): number | null {
  if (!game.dice) return null;

  const { points } = game.board;
  const dir = getDirection(game, playerId);
  const [start, end] = getHomeRange(game, playerId);

  if (dir === -1) {
    for (let i = from + 1; i <= end; i++) {
      const p = points[i];
      if (p.owner === playerId && p.count > 0) return null;
    }
  } else {
    for (let i = from - 1; i >= start; i--) {
      const p = points[i];
      if (p.owner === playerId && p.count > 0) return null;
    }
  }

  const bigger = game.dice.filter((d) => d > distance).sort((a, b) => a - b)[0];

  return bigger ?? null;
}

/* -------------------------------------------------- */
/* ✅ VALIDATE MOVE */
/* -------------------------------------------------- */

export function validateMove(
  game: GameState,
  playerId: PlayerId,
  from: number | "bar",
  to: number | "off",
): { valid: boolean; dieUsed?: number; reason?: string } {
  const { board, dice } = game;

  if (!dice || dice.length === 0) {
    return { valid: false, reason: "No dice available" };
  }

  const barCount = board.bar[playerId] ?? 0;

  if (barCount > 0 && from !== "bar") {
    return {
      valid: false,
      reason: "Must enter from bar first",
    };
  }

  if (from === "bar") {
    if (barCount === 0) {
      return { valid: false, reason: "No checker on bar" };
    }
  } else {
    const src = board.points[from];
    if (!src || src.owner !== playerId || src.count <= 0) {
      return { valid: false, reason: "Invalid source point" };
    }
  }

  if (to !== "off") {
    if (to < 0 || to > 23) {
      return { valid: false, reason: "Invalid destination" };
    }

    if (isPointBlocked(game, playerId, to)) {
      return { valid: false, reason: "Point blocked" };
    }
  }

  const distance = computeDistance(game, playerId, from, to);

  if (distance == null || distance <= 0) {
    return { valid: false, reason: "Invalid distance" };
  }

  const exactDie = findMatchingDie(game, distance);

  if (to === "off") {
    if (!canBearOff(game, playerId)) {
      return { valid: false, reason: "Cannot bear off yet" };
    }

    if (exactDie) {
      return { valid: true, dieUsed: exactDie };
    }

    if (typeof from === "number") {
      const higher = findHigherDieForBearOff(game, playerId, from, distance);

      if (higher) {
        return { valid: true, dieUsed: higher };
      }
    }

    return { valid: false, reason: "No usable die" };
  }

  if (!exactDie) {
    return { valid: false, reason: "No matching die" };
  }

  return {
    valid: true,
    dieUsed: exactDie,
  };
}

/* -------------------------------------------------- */
/* 🔍 HAS LEGAL MOVES */
/* -------------------------------------------------- */

export function hasLegalMoves(game: GameState, playerId: PlayerId): boolean {
  const { board, dice } = game;

  if (!dice || dice.length === 0) return false;

  const barCount = board.bar[playerId] ?? 0;

  if (barCount > 0) {
    for (let to = 0; to < 24; to++) {
      if (validateMove(game, playerId, "bar", to).valid) {
        return true;
      }
    }
    return false;
  }

  for (let i = 0; i < 24; i++) {
    const p = board.points[i];

    if (p.owner === playerId && p.count > 0) {
      for (let to = 0; to < 24; to++) {
        if (validateMove(game, playerId, i, to).valid) {
          return true;
        }
      }

      if (validateMove(game, playerId, i, "off").valid) {
        return true;
      }
    }
  }

  return false;
}
