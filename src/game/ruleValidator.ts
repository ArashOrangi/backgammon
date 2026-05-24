import { GameState, PlayerId, SPECIAL_POSITIONS } from "./types";

function getDirection(game: GameState, playerId: PlayerId): 1 | -1 {
  const player = game.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Unknown player");
  return player.color === "white" ? -1 : 1;
}

function getHomeRange(game: GameState, playerId: PlayerId): [number, number] {
  const dir = getDirection(game, playerId);
  return dir === -1 ? [18, 23] : [0, 5];
}

export function canBearOff(game: GameState, playerId: PlayerId): boolean {
  const [start, end] = getHomeRange(game, playerId);
  const { points, bar } = game.board;
  if ((bar[playerId] ?? 0) > 0) return false;
  for (let i = 0; i < 24; i++) {
    const p = points[i];
    if (p.owner === playerId && (i < start || i > end)) return false;
  }
  return true;
}

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

function computeDistance(
  game: GameState,
  playerId: PlayerId,
  from: number,
  to: number,
): number | null {
  const dir = getDirection(game, playerId);
  const player = game.players.find((p) => p.id === playerId)!;

  // from bar
  if (from === SPECIAL_POSITIONS.BAR) {
    const entry = dir === -1 ? 23 : 0;
    return dir === -1 ? entry - to : to - entry;
  }

  // to bear off
  if (
    to === SPECIAL_POSITIONS.BEAR_OFF_WHITE ||
    to === SPECIAL_POSITIONS.BEAR_OFF_BLACK
  ) {
    if (!canBearOff(game, playerId)) return null;
    if (dir === -1) return from + 1;
    return 24 - from;
  }

  // normal move
  return dir === -1 ? from - to : to - from;
}

function findMatchingDie(
  game: GameState,
  distance: number,
  diceOverride?: number[],
): number | null {
  const dice = diceOverride ?? game.dice;
  if (!dice || dice.length === 0) return null;
  const exact = dice.find((d) => d === distance);
  return exact ?? null;
}

function findHigherDieForBearOff(
  game: GameState,
  playerId: PlayerId,
  from: number,
  distance: number,
  diceOverride?: number[],
): number | null {
  const dice = diceOverride ?? game.dice;
  if (!dice || dice.length === 0) return null;
  const { points } = game.board;
  const dir = getDirection(game, playerId);
  const [start, end] = getHomeRange(game, playerId);
  if (dir === -1) {
    for (let i = from + 1; i <= end; i++) {
      if (points[i].owner === playerId && points[i].count > 0) return null;
    }
  } else {
    for (let i = from - 1; i >= start; i--) {
      if (points[i].owner === playerId && points[i].count > 0) return null;
    }
  }
  const bigger = dice.filter((d) => d > distance).sort((a, b) => a - b)[0];
  return bigger ?? null;
}

export function validateMove(
  game: GameState,
  playerId: PlayerId,
  from: number,
  to: number,
  diceOverride?: number[],
): { valid: boolean; dieUsed?: number; reason?: string } {
  const { board } = game;
  const dice = diceOverride ?? game.dice;
  if (!dice || dice.length === 0)
    return { valid: false, reason: "No dice available" };

  const barCount = board.bar[playerId] ?? 0;
  if (barCount > 0 && from !== SPECIAL_POSITIONS.BAR) {
    return { valid: false, reason: "Must enter from bar first" };
  }
  if (from === SPECIAL_POSITIONS.BAR) {
    if (barCount === 0) return { valid: false, reason: "No checker on bar" };
  } else {
    const src = board.points[from];
    if (!src || src.owner !== playerId || src.count <= 0) {
      return { valid: false, reason: "Invalid source point" };
    }
  }

  const isBearOff =
    to === SPECIAL_POSITIONS.BEAR_OFF_WHITE ||
    to === SPECIAL_POSITIONS.BEAR_OFF_BLACK;
  if (!isBearOff) {
    if (to < 0 || to > 23)
      return { valid: false, reason: "Invalid destination" };
    if (isPointBlocked(game, playerId, to))
      return { valid: false, reason: "Point blocked" };
  } else {
    const player = game.players.find((p) => p.id === playerId)!;
    const expectedBearOff =
      player.color === "white"
        ? SPECIAL_POSITIONS.BEAR_OFF_WHITE
        : SPECIAL_POSITIONS.BEAR_OFF_BLACK;
    if (to !== expectedBearOff) {
      return { valid: false, reason: "Invalid bear off point" };
    }
  }

  const distance = computeDistance(game, playerId, from, to);
  if (distance == null || distance <= 0)
    return { valid: false, reason: "Invalid distance" };

  if (isBearOff) {
    if (!canBearOff(game, playerId))
      return { valid: false, reason: "Cannot bear off yet" };
    const exactDie = findMatchingDie(game, distance, dice);
    if (exactDie) return { valid: true, dieUsed: exactDie };
    if (typeof from === "number") {
      const higher = findHigherDieForBearOff(
        game,
        playerId,
        from,
        distance,
        dice,
      );
      if (higher) return { valid: true, dieUsed: higher };
    }
    return { valid: false, reason: "No usable die" };
  }

  const exactDie = findMatchingDie(game, distance, dice);
  if (!exactDie) return { valid: false, reason: "No matching die" };
  return { valid: true, dieUsed: exactDie };
}

export function hasLegalMoves(game: GameState, playerId: PlayerId): boolean {
  const { board, dice } = game;
  if (!dice || dice.length === 0) return false;
  const barCount = board.bar[playerId] ?? 0;
  const player = game.players.find((p) => p.id === playerId)!;
  const bearOffPos =
    player.color === "white"
      ? SPECIAL_POSITIONS.BEAR_OFF_WHITE
      : SPECIAL_POSITIONS.BEAR_OFF_BLACK;

  if (barCount > 0) {
    for (let to = 0; to < 24; to++) {
      if (validateMove(game, playerId, SPECIAL_POSITIONS.BAR, to).valid)
        return true;
    }
    return false;
  }

  for (let i = 0; i < 24; i++) {
    const p = board.points[i];
    if (p.owner === playerId && p.count > 0) {
      for (let to = 0; to < 24; to++) {
        if (validateMove(game, playerId, i, to).valid) return true;
      }
      if (validateMove(game, playerId, i, bearOffPos).valid) return true;
    }
  }
  return false;
}
