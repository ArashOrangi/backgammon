import { GameState, PlayerId, SPECIAL_POSITIONS } from "./types";

function getDirection(game: GameState, playerId: PlayerId): 1 | -1 {
  const player = game.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Unknown player");
  return player.color === "white" ? -1 : 1;
}

export function getHomeRange(
  game: GameState,
  playerId: PlayerId,
): [number, number] {
  const dir = getDirection(game, playerId);
  return dir === -1 ? [0, 5] : [18, 23];
}

// ruleValidator.ts
export function canBearOff(game: GameState, playerId: PlayerId): boolean {
  const [start, end] = getHomeRange(game, playerId);
  const { points, bar } = game.board;
  // اگر مهره روی BAR باشد، نمی‌توان خارج کرد
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
  dieOverride?: number,
): number | null {
  const dir = getDirection(game, playerId);
  const player = game.players.find((p) => p.id === playerId);
  if (!player) return null;

  // ورود از BAR (تنها در صورتی که dieOverride داده نشده باشد استفاده می‌شود)
  // اما در validateMove ما BAR را جداگانه هندل می‌کنیم، اینجا فقط برای حالت‌های عادی و bear off
  if (from === SPECIAL_POSITIONS.BAR) {
    // اگر die داده شده باشد، مستقیماً فاصله را همان die فرض می‌کنیم (در صورت تطابق نقطه)
    if (dieOverride !== undefined) {
      const expectedPoint =
        player.color === "white" ? 24 - dieOverride : dieOverride - 1;
      if (to === expectedPoint) {
        return dieOverride;
      }
      return null;
    }
    // بدون dieOverride، فاصله را از روی نقطه مقصد محاسبه کن
    if (player.color === "white") {
      const dist = 24 - to;
      return dist >= 1 && dist <= 6 ? dist : null;
    } else {
      const dist = to + 1;
      return dist >= 1 && dist <= 6 ? dist : null;
    }
  }

  // حرکت معمولی (غیر BAR)
  if (
    to === SPECIAL_POSITIONS.BEAR_OFF_WHITE ||
    to === SPECIAL_POSITIONS.BEAR_OFF_BLACK
  ) {
    // bear off
    if (!canBearOff(game, playerId)) return null;
    if (dir === -1) return from + 1; // سفید: فاصله = اندیس مهره + 1
    return 24 - from; // سیاه: فاصله = 24 - اندیس مهره
  }

  // حرکت معمولی بین نقاط
  if (to < 0 || to > 23) return null;
  const dist = dir === -1 ? from - to : to - from;
  return dist > 0 ? dist : null;
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

// ruleValidator.ts - بخش bear off
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

  let hasCheckerBehind = false;

  if (dir === -1) {
    // سفید: خانه‌ها 0 تا 5، مهره‌های عقب‌تر اندیس بزرگ‌تر دارند
    for (let i = from + 1; i <= end; i++) {
      if (points[i].owner === playerId && points[i].count > 0) {
        hasCheckerBehind = true;
        break;
      }
    }
  } else {
    // سیاه: خانه‌ها 18 تا 23، مهره‌های عقب‌تر اندیس کوچک‌تر دارند
    for (let i = start; i < from; i++) {
      if (points[i].owner === playerId && points[i].count > 0) {
        hasCheckerBehind = true;
        break;
      }
    }
  }

  if (hasCheckerBehind) return null;

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

    const player = game.players.find((p) => p.id === playerId)!;

    // بررسی هر تاس موجود (اولویت با تاس‌های داده شده یا تاس‌های فعلی)
    for (const die of dice) {
      const expectedTo = player.color === "white" ? 24 - die : die - 1;
      if (to === expectedTo) {
        // نقطه مقصد نباید بلاک شده باشد (توسط دو یا بیشتر مهره حریف)
        if (isPointBlocked(game, playerId, to)) {
          return { isValid: false, message: "Point blocked" };
        }
        const targetPoint = game.board.points[to];
        const isHit =
          targetPoint.owner &&
          targetPoint.owner !== playerId &&
          targetPoint.count === 1;
        return { isValid: true, dieUsed: die, isHit: !!isHit };
      }
    }
    return {
      isValid: false,
      message: "No matching die for BAR entry to this point",
    };
  }

  // حرکت از نقاط تخته (غیر BAR)
  const src = board.points[from];
  if (from < 0 || from > 23) {
    return {
      isValid: false,
      message: "Invalid source position",
    };
  }
  if (!src || src.owner !== playerId || src.count <= 0) {
    return { isValid: false, message: "Invalid source point" };
  }

  const isBearOff =
    to === SPECIAL_POSITIONS.BEAR_OFF_WHITE ||
    to === SPECIAL_POSITIONS.BEAR_OFF_BLACK;

  // محاسبه فاصله (برای حرکت عادی یا bear off)
  const distance = computeDistance(game, playerId, from, to);
  if (distance == null || distance <= 0)
    return { isValid: false, message: "Invalid distance" };

  if (!isBearOff) {
    if (to < 0 || to > 23)
      return { isValid: false, message: "Invalid destination" };
    if (isPointBlocked(game, playerId, to))
      return { isValid: false, message: "Point blocked" };

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
