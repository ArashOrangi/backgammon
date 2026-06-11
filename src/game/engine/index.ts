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
  for (const player of game.players) {
    const borne = game.board.borneOff[player.id] ?? 0;
    if (borne >= 15) {
      // اعتبارسنجی: مجموع مهره‌های بازیکن باید ۱۵ باشد و هیچ مهره‌ای روی تخته یا BAR نباشد
      const onBoard = game.board.points.reduce(
        (sum, p) => sum + (p.owner === player.id ? p.count : 0),
        0,
      );
      const onBar = game.board.bar[player.id] ?? 0;
      const total = onBoard + onBar + borne;

      if (total === 15 && onBoard === 0 && onBar === 0) {
        return true;
      }

      // لاگ خطا برای دیباگ (اختیاری)
      console.error(
        `[isGameOver] Inconsistent state for player ${player.id}: borne=${borne}, onBoard=${onBoard}, onBar=${onBar}, total=${total}`,
      );
      return false;
    }
  }
  return false;
}
/**
 * محاسبه نوع برد (نرمال، مارس، سگ‌مارس)
 * با توجه به چیدمان در src/game/board.ts:
 * خانه نهایی سفید (White Home): ایندکس 0 تا 5
 * خانه نهایی سیاه (Black Home): ایندکس 18 تا 23
 */
import { getHomeRange } from "../ruleValidator"; // یا مسیر صحیح

export function calculateWinType(
  game: GameState,
  winnerId: PlayerId,
): "normal" | "mars" | "backgammon" {
  const winner = game.players.find((p) => p.id === winnerId);
  const loser = game.players.find((p) => p.id !== winnerId);
  if (!winner || !loser) return "normal";

  const loserBorneOff = game.board.borneOff[loser.id] ?? 0;
  if (loserBorneOff > 0) return "normal";

  const [homeStart, homeEnd] = getHomeRange(game, winnerId);

  let hasLoserInWinnerHome = false;
  for (let i = homeStart; i <= homeEnd; i++) {
    if (
      game.board.points[i].owner === loser.id &&
      game.board.points[i].count > 0
    ) {
      hasLoserInWinnerHome = true;
      break;
    }
  }
  const hasLoserOnBar = (game.board.bar[loser.id] ?? 0) > 0;

  if (hasLoserInWinnerHome || hasLoserOnBar) return "backgammon";
  return "mars";
}
