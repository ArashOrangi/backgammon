import { GameState } from "./types";

/**
 * بررسی قانونی بودن حرکت.
 * از قانون کوچیک شروع می‌کنیم: فقط حرکت‌هایی که از نقطه مالک خود بازیکن میاد و نقطه مقصد مجاز است.
 */
export function validateMove(
  game: GameState,
  playerId: string,
  from: number | "bar",
  to: number | "off",
): { valid: boolean; reason?: string } {
  const { board } = game;

  // اگر از بار حرکت می‌کند
  if (from === "bar") {
    if (board.bar[playerId] === 0)
      return { valid: false, reason: "هیچ مهره‌ای روی نوار نداری" };
  } else {
    const src = board.points[from];
    if (!src || src.owner !== playerId || src.count <= 0)
      return { valid: false, reason: "نقطه مبدأ متعلق به تو نیست یا خالی است" };
  }

  // اگر به off (خارج کردن مهره)
  if (to === "off") {
    if (!canBearOff(game, playerId)) {
      return { valid: false, reason: "اجازه‌ی خارج کردن مهره‌ها را نداری" };
    }
    return { valid: true };
  }

  // بررسی برخورد با مهره‌های حریف
  const dest = board.points[to];
  if (dest.owner && dest.owner !== playerId && dest.count > 1)
    return { valid: false, reason: "نقطه مقصد بسته است" };

  return { valid: true };
}

/** بررسی اجازه Bear Off */
export function canBearOff(game: GameState, playerId: string): boolean {
  const dir = playerId === game.players[0] ? 1 : -1;
  const range = dir === 1 ? [18, 23] : [0, 5];

  // اگر همه مهره‌ها در خان خانه هستند، اجازه بیرون بردن دارد
  return game.board.points
    .filter((p, i) => p.owner === playerId)
    .every((_, i) => range.includes(i));
}
