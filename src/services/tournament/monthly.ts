// src/services/tournament/monthly.service.ts

import { prisma } from "@/components/prisma";
import { TournamentService, MatchScoreInput } from "./tournament";
import { SeriesStatus, MatchResultType } from "@prisma/client";

export class MonthlyTournamentService extends TournamentService {
  // ---------- ۱. شروع سری جدید ----------
  async startSeries(
    playerId: number,
    seasonId: number,
  ): Promise<{ seriesId: number; expiresAt: Date }> {
    // بررسی بلیط
    const ticket = await prisma.userTicket.findUnique({
      where: { userId: playerId },
    });
    if (!ticket || ticket.balance < 1) {
      throw new Error("Insufficient golden tickets");
    }

    // بررسی سری فعال
    const existing = await prisma.tournamentSeries.findFirst({
      where: { playerId, seasonId, status: "ACTIVE" },
    });
    if (existing) throw new Error("You already have an active series");

    // کسر بلیط
    await prisma.userTicket.update({
      where: { userId: playerId },
      data: { balance: ticket.balance - 1 },
    });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const series = await prisma.tournamentSeries.create({
      data: {
        playerId,
        seasonId,
        expiresAt,
        status: "ACTIVE",
      },
    });

    return { seriesId: series.id, expiresAt };
  }

  // ---------- ۲. ثبت نتیجه یک مسابقه ----------
  async recordGame(
    seriesId: number,
    input: MatchScoreInput & { matchIndex: number },
  ) {
    const series = await prisma.tournamentSeries.findUnique({
      where: { id: seriesId },
      include: { games: true },
    });
    if (!series) throw new Error("Series not found");
    if (series.status !== "ACTIVE") throw new Error("Series is not active");
    if (series.games.length >= 3) throw new Error("Series already completed");

    // محاسبه امتیاز
    const score = this.calculateMatchScore(input);

    // ذخیره مسابقه
    const game = await prisma.tournamentGame.create({
      data: {
        seriesId,
        matchIndex: input.matchIndex,
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

    // به‌روزرسانی سری
    await this.updateSeriesStats(seriesId);

    // اگر ۳ مسابقه کامل شد → بستن خودکار
    const updated = await prisma.tournamentSeries.findUnique({
      where: { id: seriesId },
      include: { games: true },
    });
    if (updated && updated.games.length >= 3) {
      await this.closeSeries(seriesId, "COMPLETED");
    }

    return game;
  }

  // ---------- ۳. بستن سری (دستی یا خودکار) ----------
  async closeSeries(seriesId: number, status: SeriesStatus): Promise<void> {
    const series = await prisma.tournamentSeries.findUnique({
      where: { id: seriesId },
      include: { games: true },
    });
    if (!series) throw new Error("Series not found");

    // مسابقات انجام‌نشده = ۰ امتیاز (در واقع مسابقات انجام نشده ثبت نمی‌شوند)
    const validGames = series.games.filter(
      (g) => g.result !== MatchResultType.forfeit,
    );
    const shouldRecord = validGames.length > 0;

    await prisma.tournamentSeries.update({
      where: { id: seriesId },
      data: {
        status,
        closedAt: new Date(),
        isRecorded: shouldRecord,
        achievedAt: shouldRecord ? new Date() : null,
      },
    });

    if (shouldRecord) {
      await this.updateLeaderboard(series.seasonId, series.playerId);
    }
  }

  // ---------- ۴. بروزرسانی آمار سری ----------
  private async updateSeriesStats(seriesId: number): Promise<void> {
    const games = await prisma.tournamentGame.findMany({
      where: { seriesId },
      orderBy: { matchIndex: "asc" },
    });

    const total = games.reduce((sum, g) => sum + g.totalScore, 0);
    const best =
      games.length > 0 ? Math.max(...games.map((g) => g.totalScore)) : 0;
    const backgammons = games.filter(
      (g) => g.result === MatchResultType.backgammon,
    ).length;
    const mars = games.filter(
      (g) => g.result === MatchResultType.gammon,
    ).length;
    const pipSum = games.reduce((sum, g) => sum + g.pipBonus, 0);
    const forfeits = games.filter((g) => g.isForfeit).length;

    await prisma.tournamentSeries.update({
      where: { id: seriesId },
      data: {
        totalScore: total,
        gamesCount: games.length,
        bestSingleScore: best,
        totalBackgammonWins: backgammons,
        totalMarsWins: mars,
        totalPipAdvantage: pipSum,
        totalForfeits: forfeits,
        achievedAt: new Date(),
      },
    });
  }

  // ---------- ۵. بروزرسانی لیدربورد یک بازیکن ----------
  private async updateLeaderboard(
    seasonId: number,
    playerId: number,
  ): Promise<void> {
    // بهترین ۵ سری ثبت‌شده
    const seriesList = await prisma.tournamentSeries.findMany({
      where: {
        seasonId,
        playerId,
        isRecorded: true,
        status: { not: "ACTIVE" },
      },
      orderBy: { totalScore: "desc" },
      take: 5,
    });

    if (seriesList.length === 0) return;

    const totalScore = seriesList.reduce((sum, s) => sum + s.totalScore, 0);
    const bestSingle = Math.max(
      ...seriesList.map((s) => s.bestSingleScore ?? 0),
    );
    const totalBackgammon = seriesList.reduce(
      (sum, s) => sum + s.totalBackgammonWins,
      0,
    );
    const totalMars = seriesList.reduce((sum, s) => sum + s.totalMarsWins, 0);
    const totalPip = seriesList.reduce(
      (sum, s) => sum + s.totalPipAdvantage,
      0,
    );
    const totalForfeits = seriesList.reduce(
      (sum, s) => sum + s.totalForfeits,
      0,
    );
    const avgPip = seriesList.length > 0 ? totalPip / seriesList.length : 0;

    await prisma.tournamentLeaderboard.upsert({
      where: { seasonId_playerId: { seasonId, playerId } },
      update: {
        finalScore: totalScore,
        bestSeriesIds: seriesList.map((s) => s.id),
        bestSingleScore: bestSingle,
        totalBackgammonWins: totalBackgammon,
        totalMarsWins: totalMars,
        avgPipAdvantage: avgPip,
        totalForfeits: totalForfeits,
        seriesCount: seriesList.length,
        achievedAt: new Date(),
      },
      create: {
        seasonId,
        playerId,
        finalScore: totalScore,
        bestSeriesIds: seriesList.map((s) => s.id),
        bestSingleScore: bestSingle,
        totalBackgammonWins: totalBackgammon,
        totalMarsWins: totalMars,
        avgPipAdvantage: avgPip,
        totalForfeits: totalForfeits,
        seriesCount: seriesList.length,
        achievedAt: new Date(),
      },
    });
  }

  // ---------- ۶. بستن خودکار سری‌های منقضی‌شده ----------
  async expireActiveSeries(): Promise<void> {
    const now = new Date();
    const expired = await prisma.tournamentSeries.findMany({
      where: {
        status: "ACTIVE",
        expiresAt: { lt: now },
      },
    });
    for (const series of expired) {
      await this.closeSeries(series.id, "EXPIRED");
    }
  }

  // ---------- ۷. دریافت لیدربورد نهایی (با Tie‑breaker) ----------
  async getFinalLeaderboard(seasonId: number, limit = 100) {
    return prisma.tournamentLeaderboard.findMany({
      where: { seasonId },
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
      take: limit,
      include: {
        player: {
          select: { id: true, userName: true, avatar: true, title: true },
        },
      },
    });
  }
}
