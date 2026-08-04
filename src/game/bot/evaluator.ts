// src/game/bot/evaluator.ts
import { GameState, PlayerId } from "../types";
import { getHomeRange } from "../ruleValidator";

// وزن‌ها (قابل تنظیم از راه دور)
const WEIGHTS = {
  pip: 1.0,
  prime: 0.8,
  home: 0.5,
  blot: 0.9,
  trap: 0.7,
};

// جدول احتمال hit (از فاصله تا تعداد ترکیب‌های ۳۶ تاس)
const HIT_COMBOS: Record<number, number> = {
  1: 11,
  2: 12,
  3: 14,
  4: 15,
  5: 15,
  6: 17,
  7: 6,
  8: 6,
  9: 5,
  10: 3,
  11: 2,
  12: 3,
};

export function evaluateBoard(game: GameState, playerId: PlayerId): number {
  const self = game.players.find((p) => p.id === playerId)!;
  const opp = game.players.find((p) => p.id !== playerId)!;
  const dir = self.color === "white" ? -1 : 1;

  // ۱. اختلاف pip
  const selfPip = game.pipCount?.[playerId] ?? 0;
  const oppPip = game.pipCount?.[opp.id] ?? 0;
  const f_pip = (oppPip - selfPip) / 167; // نرمال‌سازی

  // ۲. پرایم (طول بلندترین زنجیره‌ی متوالی)
  const primeLength = getLongestPrime(game, playerId);
  const f_prime = primeLength / 6;

  // ۳. خانه‌های ساخته‌شده در خانه‌ی خودی
  const [homeStart, homeEnd] = getHomeRange(game, playerId);
  let homePoints = 0;
  for (let i = homeStart; i <= homeEnd; i++) {
    if (
      game.board.points[i].owner === playerId &&
      game.board.points[i].count >= 2
    ) {
      homePoints++;
    }
  }
  const f_home = homePoints / 6;

  // ۴. ریسک بلات (جریمه)
  let blotRisk = 0;
  for (let i = 0; i < 24; i++) {
    const p = game.board.points[i];
    if (p.owner === playerId && p.count === 1) {
      const hitProb = computeHitProbability(game, i, opp.id);
      blotRisk += hitProb;
    }
  }
  const f_blot = -blotRisk;

  // ۵. مهره‌های تله‌افتاده (پشت پرایم حریف)
  const f_trap =
    (countTrappedCheckers(game, opp.id) -
      countTrappedCheckers(game, playerId)) /
    4;

  // امتیاز نهایی
  const S =
    WEIGHTS.pip * f_pip +
    WEIGHTS.prime * f_prime +
    WEIGHTS.home * f_home +
    WEIGHTS.blot * f_blot +
    WEIGHTS.trap * f_trap;

  return S;
}

// --- توابع کمکی ---

function getLongestPrime(game: GameState, playerId: PlayerId): number {
  let maxLen = 0,
    current = 0;
  const [start, end] = getHomeRange(game, playerId);
  // پرایم معمولاً در خانه‌ی خودی مهم‌تره، ولی کل تخته رو چک می‌کنیم
  for (let i = 0; i < 24; i++) {
    const p = game.board.points[i];
    if (p.owner === playerId && p.count >= 2) {
      current++;
      maxLen = Math.max(maxLen, current);
    } else {
      current = 0;
    }
  }
  return maxLen;
}

function computeHitProbability(
  game: GameState,
  blotPoint: number,
  opponentId: PlayerId,
): number {
  let total = 0;
  for (let i = 0; i < 24; i++) {
    const p = game.board.points[i];
    if (p.owner === opponentId && p.count > 0) {
      const dist = Math.abs(i - blotPoint);
      if (dist >= 1 && dist <= 12) {
        total += HIT_COMBOS[dist] || 0;
      }
    }
  }
  return Math.min(total / 36, 1);
}

function countTrappedCheckers(game: GameState, playerId: PlayerId): number {
  // تعداد مهره‌های عقب‌تر از پرایم حریف (ساده‌سازی: هر مهره‌ای که پشت طول‌ترین پرایم حریف باشه)
  // برای پیاده‌سازی کامل، باید پرایم حریف رو پیدا کنیم و مهره‌های پشتش رو بشماریم.
  // فعلاً به‌عنوان placeholder صفر برمی‌گردونیم.
  return 0;
}
