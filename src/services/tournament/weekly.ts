// src/services/tournament/weekly.service.ts

import { prisma } from "@/components/prisma";
import { TournamentService, MatchScoreInput } from "./tournament";
import { MatchResultType } from "@prisma/client";

export class WeeklyTournamentService extends TournamentService {
  // ---------- ۱. ثبت نتیجه مسابقه ----------
  async recordGame(
    playerId: number,
    seasonId: number,
    input: MatchScoreInput,
  ): Promise<{
    matchScore: number;
    weeklyScore: number;
    forfeitLocked: boolean;
  }> {
    const score = this.calculateMatchScore(input);

    // ذخیره نتیجه
    await prisma.weeklyGameResult.create({
      data: {
        playerId,
        seasonId,
        gameId: input.gameId,
        result: input.result,
        baseScore: score.baseScore,
        pipBonus: score.pipBonus,
        cleanBonus: score.cleanBonus,
        totalScore: score.totalScore,
        isForfeit: input.result === MatchResultType.forfeit,
        finishedAt: new Date(),
      },
    });

    // محاسبه Best 20 (بدون forfeit)
    const topGames = await prisma.weeklyGameResult.findMany({
      where: {
        playerId,
        seasonId,
        isForfeit: false,
      },
      orderBy: { totalScore: "desc" },
      take: 20,
    });
    let weeklyScore = topGames.reduce((sum, g) => sum + g.totalScore, 0);

    // مدیریت Forfeit قفل‌شده
    let forfeitLocked = false;
    if (input.result === MatchResultType.forfeit) {
      const forfeitCount = await prisma.weeklyGameResult.count({
        where: { playerId, seasonId, isForfeit: true },
      });
      if (forfeitCount >= 2) {
        forfeitLocked = true;
        // ثبت یک رکورد قفل‌شده با امتیاز -۱۰
        await prisma.weeklyGameResult.create({
          data: {
            playerId,
            seasonId,
            gameId: input.gameId,
            result: MatchResultType.forfeit,
            baseScore: -10,
            totalScore: -10,
            isForfeit: true,
            isLocked: true,
            finishedAt: new Date(),
          },
        });
        // امتیاز قفل‌شده باید به امتیاز هفتگی اضافه شود (در Best 20 نمی‌آید ولی جداگانه محاسبه می‌شود)
        // در این پیاده‌سازی، آن را به weeklyScore اضافه نمی‌کنیم، بلکه در محاسبه نهایی لحاظ می‌کنیم.
        // برای سادگی، فعلاً فقط flag برمی‌گردانیم.
      }
    }

    // بروزرسانی لیدربورد
    await this.updateLeaderboard(playerId, seasonId);

    // محاسبه مجدد weeklyScore با احتساب locked forfeits
    const lockedForfeits = await prisma.weeklyGameResult.findMany({
      where: {
        playerId,
        seasonId,
        isLocked: true,
      },
    });
    const lockedScore = lockedForfeits.reduce(
      (sum, g) => sum + g.totalScore,
      0,
    );

    return {
      matchScore: score.totalScore,
      weeklyScore: weeklyScore + lockedScore,
      forfeitLocked,
    };
  }

  // ---------- ۲. بروزرسانی لیدربورد ----------
  private async updateLeaderboard(
    playerId: number,
    seasonId: number,
  ): Promise<void> {
    // محاسبه Best 20 (بدون forfeit)
    const topGames = await prisma.weeklyGameResult.findMany({
      where: { playerId, seasonId, isForfeit: false },
      orderBy: { totalScore: "desc" },
      take: 20,
    });
    let finalScore = topGames.reduce((sum, g) => sum + g.totalScore, 0);

    // اضافه کردن locked forfeits
    const lockedForfeits = await prisma.weeklyGameResult.findMany({
      where: { playerId, seasonId, isLocked: true },
    });
    finalScore += lockedForfeits.reduce((sum, g) => sum + g.totalScore, 0);

    // تعداد بازی‌های انجام‌شده (برای Eligibility)
    const totalGames = await prisma.weeklyGameResult.count({
      where: { playerId, seasonId },
    });

    await prisma.tournamentLeaderboard.upsert({
      where: { seasonId_playerId: { seasonId, playerId } },
      update: {
        finalScore,
        seriesCount: totalGames,
        achievedAt: new Date(),
      },
      create: {
        seasonId,
        playerId,
        finalScore,
        seriesCount: totalGames,
        achievedAt: new Date(),
      },
    });
  }

  // ---------- ۳. دریافت لیدربورد (فقط بازیکنان با حداقل ۵ بازی) ----------
  async getLeaderboard(seasonId: number, limit = 100) {
    // بازیکنانی که حداقل ۵ بازی دارند
    const playersWithMinGames = await prisma.weeklyGameResult.groupBy({
      by: ["playerId"],
      where: { seasonId },
      _count: true,
    });
    const eligibleIds = playersWithMinGames
      .filter((p) => p._count >= 5)
      .map((p) => p.playerId);

    return prisma.tournamentLeaderboard.findMany({
      where: {
        seasonId,
        playerId: { in: eligibleIds },
      },
      orderBy: [
        { finalScore: "desc" },
        { seriesCount: "asc" },
        { achievedAt: "asc" },
      ],
      take: limit,
      include: {
        player: {
          select: { id: true, userName: true, avatar: true, title: true },
        },
      },
    });
  }
}
