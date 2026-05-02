import { GameState, PlayerId } from "./types";

/**
 * جهت حرکت بازیکن:
 * - players[0] از 23 به 0 (dir = -1)
 * - players[1] از 0 به 23 (dir = +1)
 */
function getDirection(game: GameState, playerId: PlayerId): 1 | -1 {
  if (playerId === game.players[0]) return -1;
  if (playerId === game.players[1]) return 1;
  throw new Error("Unknown playerId in getDirection");
}

/**
 * محدوده خانه‌ی خان (home board) برای هر بازیکن
 * - Player0: 0..5
 * - Player1: 18..23
 */
function getHomeRange(game: GameState, playerId: PlayerId): [number, number] {
  if (playerId === game.players[0]) return [0, 5];
  if (playerId === game.players[1]) return [18, 23];
  throw new Error("Unknown playerId in getHomeRange");
}

/**
 * آیا همه مهره‌های بازیکن داخل home board هستند؟
 */
export function canBearOff(game: GameState, playerId: PlayerId): boolean {
  const [start, end] = getHomeRange(game, playerId);
  const { points, bar } = game.board;

  // اگر مهره روی bar دارد، قطعاً نمی‌تواند bear off کند
  if (bar[playerId] && bar[playerId] > 0) return false;

  // اگر مهره‌ای خارج از بازه‌ی home است → مجاز نیست
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.owner === playerId) {
      if (i < start || i > end) return false;
    }
  }

  return true;
}

/**
 * بررسی بسته بودن خانه مقصد برای حرکت عادی (غیر-off)
 */
function isPointBlocked(
  game: GameState,
  playerId: PlayerId,
  index: number,
): boolean {
  const point = game.board.points[index];
  if (!point.owner) return false;
  if (point.owner === playerId) return false;
  // اگر مالک حریف است و بیشتر از 1 مهره دارد → بسته است
  return point.count > 1;
}

/**
 * بر اساس from/to و جهت حرکت، فاصله (distance) حرکت را حساب می‌کند.
 * این فاصله باید با یکی از diceها match شود.
 */
function computeDistance(
  game: GameState,
  playerId: PlayerId,
  from: number | "bar",
  to: number | "off",
): number | null {
  const dir = getDirection(game, playerId);
  const [homeStart, homeEnd] = getHomeRange(game, playerId);

  if (from === "bar") {
    // ورود از bar: نقطه ورود برای هر بازیکن
    // برای سادگی:
    // - Player0 (dir = -1): وارد خانه‌ی 23
    // - Player1 (dir = +1): وارد خانه‌ی 0
    const entry = playerId === game.players[0] ? 23 : 0;
    if (to === "off") return null; // از bar مستقیم off نداریم
    if (dir === -1) {
      // از entry به to (کاهش index)
      if (to > entry) return null;
      return entry - to;
    } else {
      // dir = +1
      if (to < entry) return null;
      return to - entry;
    }
  }

  if (to === "off") {
    // bearing off: فاصله تا خارج‌شدن
    // برای home بازیکن اول: 0..5 → فاصله = index + 1
    // برای بازیکن دوم: 18..23 → فاصله = 24 - index
    if (!canBearOff(game, playerId)) return null;

    if (playerId === game.players[0]) {
      // 0..5
      if (from < homeStart || from > homeEnd) return null;
      return from + 1;
    } else {
      // player1, 18..23
      if (from < homeStart || from > homeEnd) return null;
      return 24 - from;
    }
  }

  // حرکت عادی روی تخته
  if (typeof from === "number" && typeof to === "number") {
    if (dir === -1) {
      if (to > from) return null;
      return from - to;
    } else {
      if (to < from) return null;
      return to - from;
    }
  }

  return null;
}

/**
 * چک می‌کند آیا فاصله‌ی حرکت با یکی از diceهای موجود match می‌شود یا خیر.
 * (به شکل strict: distance دقیقا برابر یکی از diceها باشد
 *  + برای bearing off، rule کلاسیک extra-die هم می‌تواند اجازه دهد، که در validateMove لحاظ می‌کنیم)
 */
function hasMatchingDie(game: GameState, distance: number): boolean {
  if (!game.dice || game.dice.length === 0) return false;
  return game.dice.some((d) => d === distance);
}

/**
 * در bearer off، اگر distance بزرگ‌تر از همه‌ی diceهای موجود باشد،
 * ولی مهره‌ی در خانه‌ی دورتر از home است، طبق قانون می‌تواند از بزرگ‌ترین dice استفاده کند.
 * این را در این helper چک می‌کنیم.
 */
function canBearOffWithHigherDie(
  game: GameState,
  playerId: PlayerId,
  from: number,
  distance: number,
): boolean {
  if (!game.dice || game.dice.length === 0) return false;

  const [homeStart, homeEnd] = getHomeRange(game, playerId);
  const dir = getDirection(game, playerId);

  // اگر مهره‌ای از این خانه به بعد (دورتر نسبت به خروج) موجود نباشد،
  // می‌توان با تاس بزرگ‌تر بیرون برد.
  const { points } = game.board;

  if (dir === -1) {
    // player0: 23→0, home 0..5, خروج از 0
    // خانه‌های "دورتر" یعنی اندیس بزرگ‌تر از from در بازه‌ی homeStart..homeEnd
    for (let i = from + 1; i <= homeEnd; i++) {
      const p = points[i];
      if (p.owner === playerId && p.count > 0) {
        return false;
      }
    }
  } else {
    // player1: 0→23, home 18..23, خروج از 23
    // خانه‌های "دورتر" یعنی اندیس کوچک‌تر از from در بازه‌ی homeStart..homeEnd
    for (let i = from - 1; i >= homeStart; i--) {
      const p = points[i];
      if (p.owner === playerId && p.count > 0) {
        return false;
      }
    }
  }

  // اگر به اینجا رسیدیم، یعنی این مهره دورترین است
  // حالا چک می‌کنیم آیا بزرگ‌ترین die از distance بزرگ‌تر است
  const maxDie = Math.max(...game.dice);
  return maxDie > distance;
}

/**
 * بررسی قانونی بودن یک حرکت خاص.
 * - نوبت بازیکن باید قبلاً در handler چک شده باشد.
 * - این تابع فقط روی قوانین بک‌گمون و dice تمرکز می‌کند.
 */
export function validateMove(
  game: GameState,
  playerId: PlayerId,
  from: number | "bar",
  to: number | "off",
): { valid: boolean; reason?: string } {
  const { board, dice } = game;

  if (!dice || dice.length === 0) {
    return { valid: false, reason: "هیچ تاسی برای حرکت نداری" };
  }

  // اگر مهره روی bar دارد، فقط از bar می‌تواند حرکت کند
  const barCount = board.bar[playerId] ?? 0;
  if (barCount > 0 && from !== "bar") {
    return {
      valid: false,
      reason: "تا وقتی مهره روی نوار داری باید اول همان‌ها را وارد کنی",
    };
  }

  // اعتبار مبدأ
  if (from === "bar") {
    if (barCount === 0)
      return { valid: false, reason: "هیچ مهره‌ای روی نوار نداری" };
  } else {
    const src = board.points[from];
    if (!src || src.owner !== playerId || src.count <= 0) {
      return {
        valid: false,
        reason: "نقطه مبدأ متعلق به تو نیست یا خالی است",
      };
    }
  }

  // اگر to روی تخته است (نه off)
  if (to !== "off") {
    if (to < 0 || to > 23) {
      return { valid: false, reason: "نقطه مقصد نامعتبر است" };
    }
    if (isPointBlocked(game, playerId, to)) {
      return { valid: false, reason: "نقطه مقصد بسته است" };
    }
  }

  // distance
  const distance = computeDistance(game, playerId, from, to);
  if (distance == null || distance <= 0) {
    return { valid: false, reason: "مسیر حرکت نامعتبر است" };
  }

  // اگر to == "off" → bearer off rules
  if (to === "off") {
    if (!canBearOff(game, playerId)) {
      return { valid: false, reason: "اجازه خارج کردن مهره‌ها را نداری" };
    }

    if (hasMatchingDie(game, distance)) {
      return { valid: true };
    }

    // check شانس استفاده از تاس بزرگ‌تر
    if (typeof from === "number") {
      if (canBearOffWithHigherDie(game, playerId, from, distance)) {
        return { valid: true };
      }
    }

    return { valid: false, reason: "هیچ تاسی با این حرکت سازگار نیست" };
  }

  // حرکت عادی روی تخته: لازمه distance با یکی از diceها match کند
  if (!hasMatchingDie(game, distance)) {
    return { valid: false, reason: "تاس مناسب برای این حرکت نداری" };
  }

  return { valid: true };
}

/**
 * آیا بازیکن با تاس‌های فعلی حداقل یک حرکت قانونی دارد؟
 * اگر نه → نوبت باید پاس شود.
 */
export function hasLegalMoves(game: GameState, playerId: PlayerId): boolean {
  const { board, dice } = game;

  if (!dice || dice.length === 0) return false;

  const barCount = board.bar[playerId] ?? 0;

  // اگر مهره روی bar دارد، فقط حرکت‌های از bar را بررسی می‌کنیم
  if (barCount > 0) {
    for (let to = 0; to < 24; to++) {
      const res = validateMove(game, playerId, "bar", to);
      if (res.valid) return true;
    }
    return false;
  }

  // در غیر این صورت، همه مهره‌های روی تخته را بررسی می‌کنیم
  for (let i = 0; i < 24; i++) {
    const p = board.points[i];
    if (p.owner === playerId && p.count > 0) {
      // حرکت روی تخته
      for (let to = 0; to < 24; to++) {
        const res = validateMove(game, playerId, i, to);
        if (res.valid) return true;
      }
      // bearer off
      const offRes = validateMove(game, playerId, i, "off");
      if (offRes.valid) return true;
    }
  }

  return false;
}
