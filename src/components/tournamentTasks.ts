// src/tasks/tournament.tasks.ts

import { prisma } from "@/components/prisma";
import { MonthlyTournamentService } from "@/services/tournament/monthly";
import { TournamentStatus } from "@prisma/client";

const monthlyService = new MonthlyTournamentService();

// ---------- بستن سری‌های منقضی‌شده (هر ۵ دقیقه) ----------
export async function expireMonthlySeries() {
  await monthlyService.expireActiveSeries();
}

// ---------- پایان فصل تورنمنت (هر روز نیمه‌شب) ----------
export async function finalizeSeasons() {
  const now = new Date();
  const seasons = await prisma.tournamentSeason.findMany({
    where: {
      status: "ACTIVE",
      endDate: { lt: now },
    },
  });

  for (const season of seasons) {
    // ۱. محاسبه رتبه نهایی (با Tie‑breaker)
    const leaderboard = await prisma.tournamentLeaderboard.findMany({
      where: { seasonId: season.id },
      orderBy: [
        { finalScore: "desc" },
        { bestSingleScore: "desc" },
        { totalBackgammonWins: "desc" },
        { totalMarsWins: "desc" },
        { avgPipAdvantage: "desc" },
        { totalForfeits: "asc" },
        { seriesCount: "asc" },
        { achievedAt: "asc" },
      ],
    });

    for (let i = 0; i < leaderboard.length; i++) {
      await prisma.tournamentLeaderboard.update({
        where: { id: leaderboard[i].id },
        data: { rank: i + 1 },
      });
    }

    // ۲. تغییر وضعیت فصل
    await prisma.tournamentSeason.update({
      where: { id: season.id },
      data: { status: "FINALIZED" },
    });

    // ۳. توزیع جوایز (با سرویس جایزه‌ها)
    // await prizeService.distribute(season.id);
  }
}
