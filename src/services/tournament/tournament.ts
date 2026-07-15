import { prisma } from "@/components/prisma";
import {
  TournamentType,
  MatchResultType,
  TournamentSeason,
  SeriesStatus,
} from "@prisma/client";

export interface MatchScoreInput {
  result: MatchResultType;
  pipAdvantage?: number;
  cleanPlay?: boolean;
  gameId: number;
  matchIndex?: number;
}

export interface MatchScoreOutput {
  baseScore: number;
  pipBonus: number;
  cleanBonus: number;
  totalScore: number;
}

export class TournamentService {
  // ---------- محاسبه امتیاز یک مسابقه ----------
  calculateMatchScore(input: MatchScoreInput): MatchScoreOutput {
    let baseScore = 0;
    switch (input.result) {
      case MatchResultType.normal:
        baseScore = 10;
        break;
      case MatchResultType.gammon:
        baseScore = 20;
        break;
      case MatchResultType.backgammon:
        baseScore = 30;
        break;
      case MatchResultType.loss:
        baseScore = 0;
        break;
      case MatchResultType.forfeit:
        baseScore = -10;
        break;
      default:
        baseScore = 0;
    }

    let pipBonus = 0;
    if (
      (input.result === MatchResultType.normal ||
        input.result === MatchResultType.gammon) &&
      input.pipAdvantage !== undefined
    ) {
      const diff = input.pipAdvantage;
      if (diff >= 0 && diff <= 24) pipBonus = 0;
      else if (diff >= 25 && diff <= 49) pipBonus = 1;
      else if (diff >= 50 && diff <= 74) pipBonus = 2;
      else if (diff >= 75) pipBonus = 3;
    }

    let cleanBonus = 0;
    if (input.cleanPlay) {
      if (
        input.result === MatchResultType.normal ||
        input.result === MatchResultType.gammon ||
        input.result === MatchResultType.backgammon
      ) {
        cleanBonus = 1;
      }
    }

    return {
      baseScore,
      pipBonus,
      cleanBonus,
      totalScore: baseScore + pipBonus + cleanBonus,
    };
  }

  // ---------- دریافت فصل جاری ----------
  async getCurrentSeason(
    type: TournamentType,
  ): Promise<TournamentSeason | null> {
    const now = new Date();
    return prisma.tournamentSeason.findFirst({
      where: {
        type,
        status: "ACTIVE",
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });
  }

  // ---------- دریافت یا ایجاد MMR تورنمنت ----------
  async getTournamentMMR(playerId: number, seasonId: number): Promise<number> {
    const record = await prisma.tournamentMMR.findUnique({
      where: { playerId_seasonId: { playerId, seasonId } },
    });
    if (record) return record.mmr;

    // مقداردهی اولیه: min(Career_MMR, 1600)
    const user = await prisma.user.findUnique({
      where: { id: playerId },
      select: { mmr: true },
    });
    const seed = user?.mmr ?? 1000;
    const initial = Math.min(seed, 1600);
    await prisma.tournamentMMR.create({
      data: { playerId, seasonId, mmr: initial },
    });
    return initial;
  }

  // ---------- بروزرسانی MMR (Elo) ----------
  async updateTournamentMMR(
    winnerId: number,
    loserId: number,
    seasonId: number,
  ): Promise<void> {
    const mmrW = await this.getTournamentMMR(winnerId, seasonId);
    const mmrL = await this.getTournamentMMR(loserId, seasonId);

    const expectedW = 1 / (1 + Math.pow(10, (mmrL - mmrW) / 400));
    const expectedL = 1 - expectedW;

    const k = this.getKFactor(mmrW);
    const newW = Math.round(mmrW + k * (1 - expectedW));
    const newL = Math.round(mmrL + k * (0 - expectedL));

    // اعمال MMR Floor
    const floor = Math.max(800, (await this.getSeed(loserId, seasonId)) - 150);
    const finalL = Math.max(newL, floor);

    await prisma.tournamentMMR.update({
      where: { playerId_seasonId: { playerId: winnerId, seasonId } },
      data: { mmr: newW },
    });
    await prisma.tournamentMMR.update({
      where: { playerId_seasonId: { playerId: loserId, seasonId } },
      data: { mmr: finalL },
    });
  }

  private getKFactor(mmr: number): number {
    if (mmr < 1600) return 16;
    if (mmr < 1800) return 12;
    if (mmr < 2000) return 8;
    return 4;
  }

  private async getSeed(playerId: number, seasonId: number): Promise<number> {
    const user = await prisma.user.findUnique({
      where: { id: playerId },
      select: { mmr: true },
    });
    return user?.mmr ?? 1000;
  }

  // ---------- متد closeSeries (برای override در کلاس فرزند) ----------
  protected async closeSeries(
    seriesId: number,
    status: SeriesStatus,
  ): Promise<void> {
    throw new Error("closeSeries must be overridden in subclass");
  }
}
