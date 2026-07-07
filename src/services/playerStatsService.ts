import { prisma } from "@/components/prisma";

// services/playerStatsService.ts
export async function updatePlayerStatsAfterGame(
  winnerId: number,
  loserId: number,
  gameId: number,
) {
  const winner = await prisma.user.findUnique({ where: { id: winnerId } });
  const loser = await prisma.user.findUnique({ where: { id: loserId } });
  if (!winner || !loser) return;

  // به‌روزرسانی MMR
  const newWinnerMmr = Math.max(0, winner.mmr + 25);
  const newLoserMmr = Math.max(0, loser.mmr - 25);

  // به‌روزرسانی استریک‌ها
  const winnerWinStreak = winner.winStreak + 1;
  const winnerLossStreak = 0;
  const loserLossStreak = loser.lossStreak + 1;
  const loserWinStreak = 0;

  // به‌روزرسانی recentResults (آخرین 2۰ بازی)
  const winnerResults = (winner.recentResults as boolean[]) || [];
  winnerResults.unshift(true);
  if (winnerResults.length > 20) winnerResults.pop();
  const loserResults = (loser.recentResults as boolean[]) || [];
  loserResults.unshift(false);
  if (loserResults.length > 20) loserResults.pop();

  // به‌روزرسانی recentOpponents (برای هر دو)
  const now = Date.now();
  const winnerOpponents = (winner.recentOpponents as any[]) || [];
  winnerOpponents.unshift({ opponentId: loserId, timestamp: now });
  if (winnerOpponents.length > 10) winnerOpponents.pop(); // نگهداری حداکثر 1۰ رکورد اخیر کافیست
  const loserOpponents = (loser.recentOpponents as any[]) || [];
  loserOpponents.unshift({ opponentId: winnerId, timestamp: now });
  if (loserOpponents.length > 10) loserOpponents.pop();

  await prisma.user.update({
    where: { id: winnerId },
    data: {
      mmr: newWinnerMmr,
      winStreak: winnerWinStreak,
      lossStreak: winnerLossStreak,
      recentResults: winnerResults,
      recentOpponents: winnerOpponents,
    },
  });
  await prisma.user.update({
    where: { id: loserId },
    data: {
      mmr: newLoserMmr,
      winStreak: loserWinStreak,
      lossStreak: loserLossStreak,
      recentResults: loserResults,
      recentOpponents: loserOpponents,
    },
  });
}
