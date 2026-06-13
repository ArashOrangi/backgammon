import { prisma } from "@/components/prisma";
import { errorHandlersOnPrisma } from "@/components/errorHandler";
import { OrmState } from "./enums";
import { RoomType } from "@prisma/client";

// --------------------------------------------------
//  ذخیره یک رکورد امتیاز
// --------------------------------------------------
export async function createMatchLBRecord(data: {
  userId: number;
  opponentId: number;
  gameId: number;
  roomType: RoomType;
  isWin: boolean;
  winType?: string;
  repetitionMultiplier: number;
  basePoints: number;
  bonusPoints: number;
  totalLBPoints: number;
  createdAt: Date;
}) {
  try {
    return await prisma.matchLBRecord.create({ data });
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

// --------------------------------------------------
//  شمارش تعداد بازی‌های قبلی در 30 دقیقه (برای repetition multiplier)
// --------------------------------------------------
export async function getPreviousMatchesCount(
  userId: number,
  opponentId: number,
  since: Date,
): Promise<number> {
  try {
    return await prisma.matchLBRecord.count({
      where: {
        userId,
        opponentId,
        createdAt: {
          lt: since,
          gte: new Date(since.getTime() - 30 * 60 * 1000),
        },
      },
    });
  } catch (error) {
    errorHandlersOnPrisma({ error });
    return 0;
  }
}

// --------------------------------------------------
//  دریافت لیدربورد (هفتگی، ماهانه، تمام‌وقت)
// --------------------------------------------------
export async function getLeaderboard(days: number | null, limit = 100) {
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

    const userIds = aggregations.map((a) => a.userId);
    const users = await prisma.users.findMany({
      where: { id: { in: userIds } },
      select: { id: true, userName: true, mmr: true, winRate: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return aggregations.map((item) => ({
      userId: item.userId,
      userName: userMap.get(item.userId)?.userName || "unknown",
      mmr: userMap.get(item.userId)?.mmr || 0,
      winRate: userMap.get(item.userId)?.winRate || 0,
      totalLBPoints: item._sum.totalLBPoints || 0,
    }));
  } catch (error) {
    errorHandlersOnPrisma({ error });
    return OrmState.Error;
  }
}
