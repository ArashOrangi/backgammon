import { GameState, PlayerId, SPECIAL_POSITIONS } from "../types";
import { canBearOff } from "../ruleValidator";

function consumeDie(game: GameState, die: number) {
  if (!game.dice || game.dice.length === 0)
    throw new Error("No dice available");
  const idx = game.dice.indexOf(die);
  if (idx === -1) throw new Error(`Die ${die} not found`);
  game.dice.splice(idx, 1);
}

function getDirection(game: GameState, playerId: PlayerId): 1 | -1 {
  const player = game.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");
  return player.color === "white" ? -1 : 1;
}

function isBearOffPosition(to: number): boolean {
  return (
    to === SPECIAL_POSITIONS.BEAR_OFF_WHITE ||
    to === SPECIAL_POSITIONS.BEAR_OFF_BLACK
  );
}

function computeDistance(
  game: GameState,
  playerId: PlayerId,
  from: number,
  to: number,
): number {
  const dir = getDirection(game, playerId);

  // هندل کردن BAR
  if (from === SPECIAL_POSITIONS.BAR) {
    const entry = dir === -1 ? 23 : 0;
    return dir === -1 ? entry - to : to - entry;
  }

  // هندل کردن Bear Off
  if (isBearOffPosition(to)) {
    if (!canBearOff(game, playerId)) throw new Error("Cannot bear off yet");
    return dir === -1 ? from + 1 : 24 - from;
  }

  // حرکت معمولی
  return dir === -1 ? from - to : to - from;
}

export function applyMove(
  game: GameState,
  playerId: PlayerId,
  from: number, // اصلاح تایپ به number
  to: number, // اصلاح تایپ به number
  dieUsed?: number,
): { hit: boolean; borneOff: boolean; dieUsed: number } {
  const { points, bar, borneOff } = game.board;

  let die = dieUsed;
  if (!die) {
    const distance = computeDistance(game, playerId, from, to);
    const exact = game.dice?.find((d) => d === distance);

    if (exact) {
      die = exact;
    } else if (isBearOffPosition(to)) {
      // اگر حرکت bear off است و عدد دقیق نداریم، بزرگتر از فاصله مجاز است
      const higher = game.dice
        ?.filter((d) => d > distance)
        .sort((a, b) => a - b)[0];
      if (higher) die = higher;
    }

    if (!die) throw new Error("No matching die found");
  }

  // 1. مدیریت برداشتن از مبدا
  if (from === SPECIAL_POSITIONS.BAR) {
    if (!bar[playerId] || bar[playerId] <= 0)
      throw new Error("No checker on bar");
    bar[playerId]--;
  } else {
    const src = points[from];
    if (!src || src.owner !== playerId || src.count === 0)
      throw new Error("Invalid source point");
    src.count--;
    if (src.count === 0) src.owner = null;
  }

  // 2. مدیریت مقصد
  let hit = false;
  let borneOffFlag = false;

  if (isBearOffPosition(to)) {
    borneOff[playerId] = (borneOff[playerId] || 0) + 1;
    borneOffFlag = true;
  } else {
    const dest = points[to];
    // منطق برخورد (Hit)
    if (dest.owner && dest.owner !== playerId && dest.count > 1)
      throw new Error("Point blocked");

    if (dest.owner && dest.owner !== playerId && dest.count === 1) {
      const opponent = dest.owner;
      bar[opponent] = (bar[opponent] || 0) + 1;
      dest.owner = playerId;
      dest.count = 1;
      hit = true;
    } else if (!dest.owner) {
      dest.owner = playerId;
      dest.count = 1;
    } else if (dest.owner === playerId) {
      dest.count++;
    }
  }

  consumeDie(game, die);
  return { hit, borneOff: borneOffFlag, dieUsed: die };
}

export function undoMove(game: GameState, dieUsed: number) {
  if (!game.dice) game.dice = [];
  game.dice.push(dieUsed);
  // توجه: ما کل استیت رو از اول لود می‌کنیم،
  // پس نیازی به جابه‌جا کردن مهره‌ها در اینجا نیست.
  // فقط برگرداندن تاس به لیست تاس‌های موجود کافیه
  // چون لود مجدد بازی از دیتابیس (بدون ایونتِ Undo شده) مهره‌ها رو سر جای قبلی میاره.
}
