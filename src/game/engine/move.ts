import { GameState, PlayerId, SPECIAL_POSITIONS } from "../types";
import { canBearOff, getHomeRange } from "../ruleValidator";

function consumeDie(game: GameState, die: number) {
  if (!game.dice || game.dice.length === 0) {
    throw new Error("No dice available");
  }

  const idx = game.dice.indexOf(die);

  if (idx === -1) {
    throw new Error(`Die ${die} not found`);
  }

  game.dice.splice(idx, 1);
}

function getDirection(game: GameState, playerId: PlayerId): 1 | -1 {
  const player = game.players.find((p) => p.id === playerId);

  if (!player) {
    throw new Error("Player not found");
  }

  return player.color === "white" ? -1 : 1;
}

function isBearOffPosition(to: number): boolean {
  return (
    to === SPECIAL_POSITIONS.BEAR_OFF_WHITE ||
    to === SPECIAL_POSITIONS.BEAR_OFF_BLACK
  );
}

function isBoardPoint(pos: number): boolean {
  return Number.isInteger(pos) && pos >= 0 && pos <= 23;
}

function assertValidBoardPoint(pos: number, label: string) {
  if (!isBoardPoint(pos)) {
    throw new Error(`${label} is not a valid board point`);
  }
}

function assertValidBarEntryTarget(
  game: GameState,
  playerId: PlayerId,
  to: number,
) {
  const dir = getDirection(game, playerId);

  assertValidBoardPoint(to, "BAR entry target");

  if (dir === -1) {
    if (to < 18 || to > 23) {
      throw new Error("Invalid BAR entry target for white player");
    }
    return;
  }

  if (to < 0 || to > 5) {
    throw new Error("Invalid BAR entry target for black player");
  }
}

function computeBarEntryDistance(
  game: GameState,
  playerId: PlayerId,
  to: number,
): number {
  const dir = getDirection(game, playerId);
  assertValidBarEntryTarget(game, playerId, to);

  if (dir === -1) {
    return 24 - to;
  }
  return to + 1;
}

function computeBearOffDistance(
  game: GameState,
  playerId: PlayerId,
  from: number,
): number {
  const dir = getDirection(game, playerId);
  assertValidBoardPoint(from, "Bear off source");

  if (!canBearOff(game, playerId)) {
    throw new Error("Cannot bear off yet");
  }

  if (dir === -1) {
    return from + 1;
  }
  return 24 - from;
}

function computeNormalDistance(
  game: GameState,
  playerId: PlayerId,
  from: number,
  to: number,
): number {
  const dir = getDirection(game, playerId);
  assertValidBoardPoint(from, "Move source");
  assertValidBoardPoint(to, "Move target");

  const distance = dir === -1 ? from - to : to - from;

  if (distance <= 0) {
    throw new Error("Invalid move direction");
  }
  return distance;
}

function computeDistance(
  game: GameState,
  playerId: PlayerId,
  from: number,
  to: number,
): number {
  if (from === SPECIAL_POSITIONS.BAR) {
    return computeBarEntryDistance(game, playerId, to);
  }
  if (isBearOffPosition(to)) {
    return computeBearOffDistance(game, playerId, from);
  }
  return computeNormalDistance(game, playerId, from, to);
}

// Helper to check if there is any checker farther from bear-off point
function hasCheckerBehindForBearOff(
  game: GameState,
  playerId: PlayerId,
  from: number,
): boolean {
  const dir = getDirection(game, playerId);
  const [start, end] = getHomeRange(game, playerId);
  const { points } = game.board;

  if (dir === -1) {
    // White: farther checkers have higher indices
    for (let i = from + 1; i <= end; i++) {
      if (points[i].owner === playerId && points[i].count > 0) return true;
    }
  } else {
    // Black: farther checkers have lower indices
    for (let i = start; i < from; i++) {
      if (points[i].owner === playerId && points[i].count > 0) return true;
    }
  }
  return false;
}

function resolveDieForMove(
  game: GameState,
  playerId: PlayerId,
  from: number,
  to: number,
  dieUsed?: number,
): number {
  if (!game.dice || game.dice.length === 0) {
    throw new Error("No dice available");
  }

  const distance = computeDistance(game, playerId, from, to);

  if (dieUsed !== undefined && dieUsed !== null) {
    if (!game.dice.includes(dieUsed)) {
      throw new Error(`Die ${dieUsed} not found`);
    }

    if (!isBearOffPosition(to)) {
      if (dieUsed !== distance) {
        throw new Error("No matching die for this distance");
      }
      return dieUsed;
    }

    // Bear-off case
    if (dieUsed < distance) {
      throw new Error("Die is too small for bear off");
    }
    if (
      dieUsed > distance &&
      hasCheckerBehindForBearOff(game, playerId, from)
    ) {
      throw new Error("Cannot use a larger die when a checker is farther away");
    }
    return dieUsed;
  }

  // No die provided by client – auto-select
  const exact = game.dice.find((d) => d === distance);
  if (exact !== undefined) {
    return exact;
  }

  if (isBearOffPosition(to)) {
    const higher = game.dice
      .filter((d) => d > distance)
      .sort((a, b) => a - b)[0];
    if (higher !== undefined) {
      // But we must also enforce the "no checker behind" rule here!
      if (
        higher > distance &&
        hasCheckerBehindForBearOff(game, playerId, from)
      ) {
        throw new Error(
          "Cannot use a larger die when a checker is farther away",
        );
      }
      return higher;
    }
  }

  throw new Error("No matching die for this distance");
}

function removeCheckerFromSource(
  game: GameState,
  playerId: PlayerId,
  from: number,
) {
  const { points, bar } = game.board;

  if (from === SPECIAL_POSITIONS.BAR) {
    if (!bar[playerId] || bar[playerId] <= 0) {
      throw new Error("No checker on bar");
    }
    bar[playerId]--;
    return;
  }

  assertValidBoardPoint(from, "Move source");
  const src = points[from];
  if (!src || src.owner !== playerId || src.count === 0) {
    throw new Error("Invalid source point");
  }
  src.count--;
  if (src.count === 0) {
    src.owner = null;
  }
}

function placeCheckerToDestination(
  game: GameState,
  playerId: PlayerId,
  to: number,
): { hit: boolean; borneOff: boolean } {
  const { points, bar, borneOff } = game.board;

  if (isBearOffPosition(to)) {
    borneOff[playerId] = (borneOff[playerId] || 0) + 1;
    return { hit: false, borneOff: true };
  }

  assertValidBoardPoint(to, "Move target");
  const dest = points[to];
  if (!dest) {
    throw new Error("Invalid destination point");
  }

  if (dest.owner && dest.owner !== playerId && dest.count > 1) {
    throw new Error("Point blocked");
  }

  if (dest.owner && dest.owner !== playerId && dest.count === 1) {
    const opponent = dest.owner;
    bar[opponent] = (bar[opponent] || 0) + 1;
    dest.owner = playerId;
    dest.count = 1;
    return { hit: true, borneOff: false };
  }

  if (!dest.owner) {
    dest.owner = playerId;
    dest.count = 1;
    return { hit: false, borneOff: false };
  }

  if (dest.owner === playerId) {
    dest.count++;
    return { hit: false, borneOff: false };
  }

  throw new Error("Invalid destination state");
}

export function applyMove(
  game: GameState,
  playerId: PlayerId,
  from: number,
  to: number,
  dieUsed?: number,
): { hit: boolean; borneOff: boolean; dieUsed: number } {
  const die = resolveDieForMove(game, playerId, from, to, dieUsed);
  removeCheckerFromSource(game, playerId, from);
  const result = placeCheckerToDestination(game, playerId, to);
  consumeDie(game, die);
  return {
    hit: result.hit,
    borneOff: result.borneOff,
    dieUsed: die,
  };
}

export function undoMove(game: GameState, dieUsed: number) {
  if (!game.dice) {
    game.dice = [];
  }
  game.dice.push(dieUsed);
}
