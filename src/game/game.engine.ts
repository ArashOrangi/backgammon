import { Board, GameState, PlayerId } from "./types";
import { canBearOff } from "./rule-validator";

/**
 * تاس ریختن: دابل → ۴ تاس
 */
export function rollDice(game: GameState): number[] {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  const dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];

  game.dice = dice;
  return dice;
}

export function switchTurn(game: GameState) {
  const idx = game.players.indexOf(game.turn);
  if (idx === -1) {
    throw new Error("Current turn player not found");
  }
  const nextIndex = (idx + 1) % game.players.length;
  game.turn = game.players[nextIndex];
}

/**
 * حذف یکی از تاس‌ها که با distance استفاده شده
 */
function consumeDie(game: GameState, distance: number) {
  if (!game.dice) return;
  // اول تلاش می‌کنیم تاس دقیقا برابر distance را حذف کنیم
  let idx = game.dice.findIndex((d) => d === distance);
  if (idx === -1) {
    // اگر نبود، تاس بزرگ‌تر (برای bearer off) را حذف می‌کنیم
    idx = game.dice.findIndex((d) => d > distance);
  }
  if (idx !== -1) {
    game.dice.splice(idx, 1);
  }
}

/**
 * به دست آوردن جهت حرکت بازیکن
 */
function getDirection(game: GameState, playerId: PlayerId): 1 | -1 {
  if (playerId === game.players[0]) return -1;
  if (playerId === game.players[1]) return 1;
  throw new Error("Unknown playerId in getDirection");
}

/**
 * تابع کمکی: به‌دست آوردن distance مشابه rule-validator
 */
function computeDistanceForApply(
  game: GameState,
  playerId: PlayerId,
  from: number | "bar",
  to: number | "off",
): number {
  const dir = getDirection(game, playerId);

  if (from === "bar") {
    const entry = playerId === game.players[0] ? 23 : 0;
    if (typeof to !== "number") {
      throw new Error("Invalid 'to' for move from bar");
    }
    if (dir === -1) {
      if (to > entry) throw new Error("Invalid move direction from bar");
      return entry - to;
    } else {
      if (to < entry) throw new Error("Invalid move direction from bar");
      return to - entry;
    }
  }

  if (to === "off") {
    if (!canBearOff(game, playerId)) {
      throw new Error("Cannot bear off");
    }
    if (playerId === game.players[0]) {
      // 0..5
      if (typeof from !== "number") throw new Error("Invalid 'from' for off");
      return from + 1;
    } else {
      if (typeof from !== "number") throw new Error("Invalid 'from' for off");
      return 24 - from;
    }
  }

  if (typeof from === "number" && typeof to === "number") {
    if (dir === -1) {
      if (to > from) throw new Error("Invalid move direction");
      return from - to;
    } else {
      if (to < from) throw new Error("Invalid move direction");
      return to - from;
    }
  }

  throw new Error("Invalid from/to combination");
}

/**
 * اعمال یک حرکت (فرض بر این است که validateMove قبلا آن را تایید کرده)
 */
export function applyMove(
  game: GameState,
  playerId: PlayerId,
  from: number | "bar",
  to: number | "off",
) {
  const { board } = game;
  const { points, bar, borneOff } = board;

  // محاسبه distance برای consumeDice
  const distance = computeDistanceForApply(game, playerId, from, to);

  // کم کردن از مبدأ
  if (from === "bar") {
    if (!bar[playerId] || bar[playerId] <= 0) {
      throw new Error("No checkers on bar to move");
    }
    bar[playerId] -= 1;
  } else {
    const src = points[from];
    if (!src || src.owner !== playerId || src.count <= 0) {
      throw new Error("Invalid source point for applyMove");
    }
    src.count -= 1;
    if (src.count === 0) {
      src.owner = null;
    }
  }

  // اگر به off می‌رود → borneOff افزایش می‌یابد
  if (to === "off") {
    borneOff[playerId] = (borneOff[playerId] ?? 0) + 1;
    consumeDie(game, distance);
    return;
  }

  // به نقطه روی تخته:
  const dest = points[to];

  // اگر مهره حریف تنها است → hit
  if (dest.owner && dest.owner !== playerId && dest.count === 1) {
    const opponent = dest.owner;
    // مهره حریف به bar
    bar[opponent] = (bar[opponent] ?? 0) + 1;
    // نقطه الان خالی می‌شود و مهره ما را می‌گیرد
    dest.owner = playerId;
    dest.count = 1;
  } else {
    // خانه خالی یا متعلق به خودمان
    if (!dest.owner) {
      dest.owner = playerId;
      dest.count = 1;
    } else if (dest.owner === playerId) {
      dest.count += 1;
    } else {
      // این حالت اصولاً در validateMove رد شده، ولی برای ایمنی:
      throw new Error("Destination point is blocked");
    }
  }

  // مصرف تاس
  consumeDie(game, distance);
}
