import { GameState, PlayerId } from "../types";

export * from "./move";
export * from "./turn";
export * from "./timer";
export * from "./dice";
export * from "./starting";

/* -------------------------------------------------- */
/* 🏁 GAME OVER & WIN TYPE LOGIC */
/* -------------------------------------------------- */

/**
 * بررسی پایان بازی
 */
export function isGameOver(game: GameState): boolean {
  return game.players.some((p) => (game.board.borneOff[p.id] ?? 0) >= 15);
}

/**
 * محاسبه نوع برد (نرمال، مارس، سگ‌مارس)
 * با توجه به چیدمان در src/game/board.ts:
 * خانه نهایی سفید (White Home): ایندکس 0 تا 5
 * خانه نهایی سیاه (Black Home): ایندکس 18 تا 23
 */
export function calculateWinType(
  game: GameState,
  winnerId: PlayerId,
): "normal" | "mars" | "backgammon" {
  const winner = game.players.find((p) => p.id === winnerId);
  const loser = game.players.find((p) => p.id !== winnerId);

  if (!winner || !loser) return "normal";

  // ۱. اگر بازنده حداقل یک مهره بیرون برده باشد -> NORMAL
  const loserBorneOff = game.board.borneOff[loser.id] ?? 0;
  if (loserBorneOff > 0) return "normal";

  /**
   * برای BACKGAMMON باید چک کنیم آیا بازنده مهره‌ای در خانه برنده دارد یا خیر.
   * اگر برنده سفید است، خانه او ایندکس 0 تا 5 است.
   * اگر برنده سیاه است، خانه او ایندکس 18 تا 23 است.
   */
  const winnerHomeIndices =
    winner.color === "white" ? [0, 1, 2, 3, 4, 5] : [18, 19, 20, 21, 22, 23];

  const hasLoserInWinnerHome = game.board.points.some((point, index) => {
    return (
      winnerHomeIndices.includes(index) &&
      point.owner === loser.id &&
      point.count > 0
    );
  });

  const hasLoserOnBar = (game.board.bar[loser.id] ?? 0) > 0;

  // ۲. اگر مهره‌ای در خانه حریف یا روی Bar داشته باشد -> BACKGAMMON
  if (hasLoserInWinnerHome || hasLoserOnBar) {
    return "backgammon";
  }

  // ۳. در غیر این صورت -> MARS
  return "mars";
}
