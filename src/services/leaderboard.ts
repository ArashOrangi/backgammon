import { prisma } from "@/components/prisma";
import { GameState } from "@/game/types";
import { RoomType } from "@prisma/client";

const ROOM_BASE_POINTS: Record<number, { win: number; loss: number }> = {
  1: { win: 8, loss: 1 },
  2: { win: 11, loss: 1 },
  3: { win: 17, loss: 2 },
  4: { win: 23, loss: 2 },
  5: { win: 30, loss: 3 },
  6: { win: 38, loss: 3 },
  7: { win: 47, loss: 4 },
  8: { win: 57, loss: 4 },
  9: { win: 68, loss: 5 },
};

const ROOM_TO_R_MAP: Record<RoomType, number> = {
  [RoomType.CASUAL_1]: 1,
  [RoomType.CASUAL_2]: 3,
  [RoomType.COMPETITIVE_1]: 5,
  [RoomType.COMPETITIVE_2]: 7,
};

const WIN_TYPE_BONUS: Record<string, number> = {
  normal: 0,
  mars: 7,
  backgammon: 10,
};

export async function calculateLBPoints(gameId: number, state: GameState) {
  try {
    const roomType = state.roomType as RoomType;
    if (!roomType) {
      console.error(
        `[Leaderboard] Room type not found in state for game ${gameId}`,
      );
      return;
    }

    const rNumber = ROOM_TO_R_MAP[roomType];
    if (!rNumber) {
      console.error(`[Leaderboard] Unknown room type: ${roomType}`);
      return;
    }

    const basePoints = ROOM_BASE_POINTS[rNumber];
    if (!basePoints) {
      console.error(`[Leaderboard] No base points for R${rNumber}`);
      return;
    }

    const winnerId = state.winner;
    if (!winnerId) {
      console.error(`[Leaderboard] No winner found for game ${gameId}`);
      return;
    }

    const loserId = state.players.find((p) => p.id !== winnerId)?.id;
    if (!loserId) {
      console.error(`[Leaderboard] Loser not found for game ${gameId}`);
      return;
    }

    const winType = state.winType || "normal";
    const winTypeBonus = WIN_TYPE_BONUS[winType] || 0;

    const winnerMultiplier = await getRepetitionMultiplier(winnerId, loserId);
    const loserMultiplier = await getRepetitionMultiplier(loserId, winnerId);

    const winnerTotal = Math.floor(
      (basePoints.win + winTypeBonus) * winnerMultiplier,
    );
    const loserTotal = Math.floor(basePoints.loss * loserMultiplier);

    // بررسی وجود gameId در جدول Games
    const gameExists = await prisma.games.findUnique({ where: { id: gameId } });
    if (!gameExists) {
      console.error(`[Leaderboard] Game ${gameId} not found in Games table`);
      // اگر بازی وجود ندارد، یک بازی فیک ایجاد کنیم
      const fakeGame = await prisma.games.create({
        data: {
          whitePlayerId: winnerId,
          blackPlayerId: loserId,
          status: "FINISHED",
        },
      });
      // بازیابی gameId واقعی
      const realGameId = fakeGame.id;

      // ذخیره در MatchLBRecord با gameId واقعی
      await prisma.matchLBRecord.create({
        data: {
          userId: winnerId,
          opponentId: loserId,
          gameId: realGameId,
          roomType,
          isWin: true,
          winType,
          repetitionMultiplier: winnerMultiplier,
          basePoints: basePoints.win,
          bonusPoints: winTypeBonus,
          totalLBPoints: winnerTotal,
        },
      });

      await prisma.matchLBRecord.create({
        data: {
          userId: loserId,
          opponentId: winnerId,
          gameId: realGameId,
          roomType,
          isWin: false,
          winType: null,
          repetitionMultiplier: loserMultiplier,
          basePoints: basePoints.loss,
          bonusPoints: 0,
          totalLBPoints: loserTotal,
        },
      });

      console.log(
        `[Leaderboard] Game ${gameId} processed with new game ${realGameId}: Winner +${winnerTotal}LB, Loser +${loserTotal}LB`,
      );
      return;
    }

    await prisma.matchLBRecord.create({
      data: {
        userId: winnerId,
        opponentId: loserId,
        gameId,
        roomType,
        isWin: true,
        winType,
        repetitionMultiplier: winnerMultiplier,
        basePoints: basePoints.win,
        bonusPoints: winTypeBonus,
        totalLBPoints: winnerTotal,
      },
    });

    await prisma.matchLBRecord.create({
      data: {
        userId: loserId,
        opponentId: winnerId,
        gameId,
        roomType,
        isWin: false,
        winType: null,
        repetitionMultiplier: loserMultiplier,
        basePoints: basePoints.loss,
        bonusPoints: 0,
        totalLBPoints: loserTotal,
      },
    });

    console.log(
      `[Leaderboard] Game ${gameId} processed: Winner +${winnerTotal}LB, Loser +${loserTotal}LB`,
    );
  } catch (error) {
    console.error("[Leaderboard] Error:", error);
  }
}

async function getRepetitionMultiplier(
  userId: number,
  opponentId: number,
): Promise<number> {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const previousMatches = await prisma.matchLBRecord.count({
      where: {
        userId,
        opponentId,
        createdAt: {
          gte: thirtyMinutesAgo,
        },
      },
    });

    const matchNumber = previousMatches + 1;
    if (matchNumber >= 4) return 0;
    if (matchNumber === 3) return 0.5;
    return 1;
  } catch (error) {
    console.error("[Leaderboard] getRepetitionMultiplier error:", error);
    return 1;
  }
}

/**
 * دریافت لیدربورد با بازه زمانی - همیشه آرایه برمی‌گرداند (حتی خالی)
 */
export async function getLeaderboard(days: number | null, limit: number = 100) {
  try {
    const startDate = days
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      : undefined;

    const where = startDate ? { createdAt: { gte: startDate } } : {};

    const aggregations = await prisma.matchLBRecord.groupBy({
      by: ["userId"],
      where,
      _sum: { totalLBPoints: true },
      orderBy: { _sum: { totalLBPoints: "desc" } },
      take: limit,
    });

    // اگر رکوردی وجود نداشت، آرایه خالی برگردان
    if (!aggregations || aggregations.length === 0) {
      return [];
    }

    const userIds = aggregations.map((a) => a.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        userName: true,
        mmr: true,
        winRate: true,
        avatar: true,
        title: true,
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return aggregations.map((item) => ({
      userId: item.userId,
      userName: userMap.get(item.userId)?.userName || "unknown",
      mmr: userMap.get(item.userId)?.mmr || 0,
      winRate: userMap.get(item.userId)?.winRate || 0,
      avatar: userMap.get(item.userId)?.avatar || null,
      title: userMap.get(item.userId)?.title || null,
      totalLBPoints: item._sum.totalLBPoints || 0,
    }));
  } catch (error) {
    console.error("[Leaderboard] getLeaderboard error:", error);
    // در صورت هرگونه خطا، آرایه خالی برگردان
    return [];
  }
}
