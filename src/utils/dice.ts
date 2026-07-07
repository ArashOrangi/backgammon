/**
 * تاس تک عددی برای start-roll
 */
export function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

/**
 * تاس معمولی بازی:
 * - اگر دابل → ۴ تاس
 * - اگر عادی → 2 تاس
 */
export function rollDice(): number[] {
  const d1 = rollDie();
  const d2 = rollDie();

  return d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
}
