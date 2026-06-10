import { GameState, PlayerId, SPECIAL_POSITIONS } from "../types";
import { canBearOff } from "../ruleValidator";

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
    /**
     * White enters from opponent home board.
     *
     * Internal index mapping:
     * die 1 => to 23
     * die 2 => to 22
     * die 3 => to 21
     * die 4 => to 20
     * die 5 => to 19
     * die 6 => to 18
     */
    if (to < 18 || to > 23) {
      throw new Error("Invalid BAR entry target for white player");
    }

    return;
  }

  /**
   * Black enters from opponent home board.
   *
   * Internal index mapping:
   * die 1 => to 0
   * die 2 => to 1
   * die 3 => to 2
   * die 4 => to 3
   * die 5 => to 4
   * die 6 => to 5
   */
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
    /**
     * White:
     * die 1 => to 23 => 24 - 23 = 1
     * die 5 => to 19 => 24 - 19 = 5
     */
    return 24 - to;
  }

  /**
   * Black:
   * die 1 => to 0 => 0 + 1 = 1
   * die 5 => to 4 => 4 + 1 = 5
   */
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

  /**
   * White moves from high index to low index.
   *
   * Home board for white is usually indices 0..5.
   * from 0 => distance 1
   * from 4 => distance 5
   */
  if (dir === -1) {
    return from + 1;
  }

  /**
   * Black moves from low index to high index.
   *
   * Home board for black is usually indices 18..23.
   * from 23 => distance 1
   * from 19 => distance 5
   */
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

  /**
   * اگر کلاینت die را فرستاده باشد، باید هم در dice موجود باشد
   * و هم با distance حرکت سازگار باشد.
   */
  if (dieUsed !== undefined && dieUsed !== null) {
    if (!game.dice.includes(dieUsed)) {
      throw new Error(`Die ${dieUsed} not found`);
    }

    /**
     * برای حرکت معمولی و ورود از BAR، تاس باید دقیقاً برابر distance باشد.
     */
    if (!isBearOffPosition(to)) {
      if (dieUsed !== distance) {
        throw new Error("No matching die for this distance");
      }

      return dieUsed;
    }

    /**
     * برای bear off:
     * - die برابر distance همیشه مجاز است.
     * - die بزرگ‌تر ممکن است مجاز باشد، ولی قوانین دقیق‌تر نیاز به بررسی مهره‌های عقب‌تر دارد.
     *
     * در این نسخه، فقط از نظر عددی اجازه‌ی die >= distance داده شده
     * چون canBearOff قبلاً بررسی کرده همه مهره‌ها در home board هستند.
     *
     * اگر بخواهی strict backgammon rule کامل داشته باشیم،
     * باید چک کنیم هیچ مهره‌ای عقب‌تر از این مهره وجود ندارد.
     */
    if (dieUsed < distance) {
      throw new Error("Die is too small for bear off");
    }

    return dieUsed;
  }

  /**
   * اگر die از کلاینت نیامده باشد، خودمان مناسب‌ترین تاس را انتخاب می‌کنیم.
   */
  const exact = game.dice.find((d) => d === distance);

  if (exact !== undefined) {
    return exact;
  }

  /**
   * برای bear off اگر تاس دقیق نبود، ممکن است تاس بزرگ‌تر قابل استفاده باشد.
   */
  if (isBearOffPosition(to)) {
    const higher = game.dice
      .filter((d) => d > distance)
      .sort((a, b) => a - b)[0];

    if (higher !== undefined) {
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

    return {
      hit: false,
      borneOff: true,
    };
  }

  assertValidBoardPoint(to, "Move target");

  const dest = points[to];

  if (!dest) {
    throw new Error("Invalid destination point");
  }

  /**
   * Point blocked:
   * اگر مقصد متعلق به حریف باشد و بیشتر از یک مهره داشته باشد،
   * حرکت غیرمجاز است.
   */
  if (dest.owner && dest.owner !== playerId && dest.count > 1) {
    throw new Error("Point blocked");
  }

  /**
   * Hit:
   * اگر مقصد متعلق به حریف باشد و دقیقاً یک مهره داشته باشد،
   * مهره حریف به BAR می‌رود.
   */
  if (dest.owner && dest.owner !== playerId && dest.count === 1) {
    const opponent = dest.owner;

    bar[opponent] = (bar[opponent] || 0) + 1;

    dest.owner = playerId;
    dest.count = 1;

    return {
      hit: true,
      borneOff: false,
    };
  }

  /**
   * Empty point
   */
  if (!dest.owner) {
    dest.owner = playerId;
    dest.count = 1;

    return {
      hit: false,
      borneOff: false,
    };
  }

  /**
   * Own point
   */
  if (dest.owner === playerId) {
    dest.count++;

    return {
      hit: false,
      borneOff: false,
    };
  }

  /**
   * نباید به اینجا برسیم، ولی برای safety نگه می‌داریم.
   */
  throw new Error("Invalid destination state");
}

export function applyMove(
  game: GameState,
  playerId: PlayerId,
  from: number,
  to: number,
  dieUsed?: number,
): { hit: boolean; borneOff: boolean; dieUsed: number } {
  /**
   * بسیار مهم:
   * اول die را resolve و validate می‌کنیم،
   * قبل از اینکه state را mutate کنیم.
   *
   * اگر حرکت invalid باشد، نباید حتی یک مهره هم جابه‌جا شود.
   */
  const die = resolveDieForMove(game, playerId, from, to, dieUsed);

  /**
   * اول مهره را از مبدا برمی‌داریم.
   */
  removeCheckerFromSource(game, playerId, from);

  /**
   * بعد در مقصد قرار می‌دهیم.
   */
  const result = placeCheckerToDestination(game, playerId, to);

  /**
   * در انتها تاس را مصرف می‌کنیم.
   */
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

  /**
   * توجه:
   * در معماری event-sourcing فعلی، ما کل state را از ابتدا rebuild می‌کنیم.
   * بنابراین undoMove قرار نیست مهره‌ها را دستی برگرداند.
   *
   * وقتی event مربوط به move با markAsUndo غیرفعال شود،
   * rebuild بازی را بدون آن event می‌سازد و مهره‌ها خودبه‌خود
   * به وضعیت قبلی برمی‌گردند.
   *
   * این تابع فقط die را به لیست dice برمی‌گرداند، اگر جایی در flow لازم باشد.
   */
}
