import { GameState, PlayerId, SPECIAL_POSITIONS } from "./types";

function getDirection(game: GameState, playerId: PlayerId): 1 | -1 {
  const player = game.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Unknown player");
  return player.color === "white" ? -1 : 1;
}

function getHomeRange(game: GameState, playerId: PlayerId): [number, number] {
  const dir = getDirection(game, playerId);
  return dir === -1 ? [0, 5] : [18, 23];
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
  const player = game.players.find((p) => p.id === playerId);
  if (!player) return null;

  // from bar
  if (from === SPECIAL_POSITIONS.BAR) {
    if (player.color === "white") {
      // سفید: نقاط 0 تا 5
      return to + 1;
    } else {
      // سیاه: نقاط 18 تا 23
      return 24 - to;
    }
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

  // بررسی اینکه آیا مهره‌ای عقب‌تر (نسبت به خروج) وجود دارد
  let hasCheckerBehind = false;
  if (dir === -1) {
    // سفید: عقب‌تر یعنی ایندکس بزرگتر (نزدیک به 23)
    for (let i = from + 1; i <= end; i++) {
      if (points[i].owner === playerId && points[i].count > 0) {
        hasCheckerBehind = true;
        break;
      }
    }
  } else {
    // سیاه: عقب‌تر یعنی ایندکس کوچکتر (نزدیک به 0)
    for (let i = from - 1; i >= start; i--) {
      if (points[i].owner === playerId && points[i].count > 0) {
        hasCheckerBehind = true;
        break;
      }
    }
  }

  // اگر مهره‌ای عقب‌تر وجود دارد، نمی‌توان از تاس بزرگتر استفاده کرد
  if (hasCheckerBehind) return null;

  // پیدا کردن کوچکترین تاس بزرگتر از distance
  const bigger = dice.filter((d) => d > distance).sort((a, b) => a - b)[0];
  return bigger ?? null;
}

export function validateMove(
  game: GameState,
  playerId: PlayerId,
  from: number,
  to: number,
  diceOverride?: number[],
): { isValid: boolean; isHit?: boolean; dieUsed?: number; message?: string } {
  const { board } = game;
  const dice = diceOverride ?? game.dice;
  console.log(
    `[DEBUG] validateMove: player=${playerId}, from=${from}, to=${to}, dice=${dice}`,
  );

  if (!dice || dice.length === 0)
    return { isValid: false, message: "No dice available" };

  const barCount = board.bar[playerId] ?? 0;
  if (barCount > 0 && from !== SPECIAL_POSITIONS.BAR) {
    return { isValid: false, message: "Must enter from bar first" };
  }

  if (from === SPECIAL_POSITIONS.BAR) {
    if (barCount === 0) return { isValid: false, message: "No checker on bar" };
  } else {
    const src = board.points[from];
    if (!src || src.owner !== playerId || src.count <= 0) {
      return { isValid: false, message: "Invalid source point" };
    }
  }

  const isBearOff =
    to === SPECIAL_POSITIONS.BEAR_OFF_WHITE ||
    to === SPECIAL_POSITIONS.BEAR_OFF_BLACK;

  const distance = computeDistance(game, playerId, from, to);
  if (distance == null || distance <= 0)
    return { isValid: false, message: "Invalid distance" };

  if (!isBearOff) {
    if (to < 0 || to > 23)
      return { isValid: false, message: "Invalid destination" };
    if (isPointBlocked(game, playerId, to))
      return { isValid: false, message: "Point blocked" };

    // تشخیص زدن مهره (Hit)
    const targetPoint = game.board.points[to];
    const isHit =
      targetPoint.owner &&
      targetPoint.owner !== playerId &&
      targetPoint.count === 1;

    const exactDie = findMatchingDie(game, distance, dice);
    if (!exactDie)
      return { isValid: false, message: "No matching die for this distance" };

    return { isValid: true, dieUsed: exactDie, isHit: !!isHit };
  } else {
    // منطق Bear Off
    const player = game.players.find((p) => p.id === playerId)!;
    const expectedBearOff =
      player.color === "white"
        ? SPECIAL_POSITIONS.BEAR_OFF_WHITE
        : SPECIAL_POSITIONS.BEAR_OFF_BLACK;

    if (to !== expectedBearOff) {
      return { isValid: false, message: "Invalid bear off point" };
    }

    if (!canBearOff(game, playerId))
      return {
        isValid: false,
        message: "Cannot bear off yet, bring all checkers home",
      };

    const exactDie = findMatchingDie(game, distance, dice);
    if (exactDie) return { isValid: true, dieUsed: exactDie, isHit: false };

    const higher = findHigherDieForBearOff(
      game,
      playerId,
      from,
      distance,
      dice,
    );
    if (higher) return { isValid: true, dieUsed: higher, isHit: false };

    return { isValid: false, message: "No usable die for bear off" };
  }
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
      if (validateMove(game, playerId, SPECIAL_POSITIONS.BAR, to).isValid)
        return true;
    }
    return false;
  }

  for (let i = 0; i < 24; i++) {
    const p = board.points[i];
    if (p.owner === playerId && p.count > 0) {
      for (let to = 0; to < 24; to++) {
        if (validateMove(game, playerId, i, to).isValid) return true;
      }
      if (validateMove(game, playerId, i, bearOffPos).isValid) return true;
    }
  }
  return false;
}
