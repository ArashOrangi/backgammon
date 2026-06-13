import { Hono } from "hono";
import { prisma } from "@/components/prisma";
import {
  onOkRestResponse,
  onErrorRestResponse,
} from "@/responses/response-builder";

export const leaderboardRoutes = new Hono();

async function getLeaderboard(days: number | null, limit = 100) {
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
}

leaderboardRoutes.get("/weekly", async (c) => {
  const limit = Number(c.req.query("limit")) || 100;
  const data = await getLeaderboard(7, limit);
  return onOkRestResponse({ ctx: c, data });
});

leaderboardRoutes.get("/monthly", async (c) => {
  const limit = Number(c.req.query("limit")) || 100;
  const data = await getLeaderboard(30, limit);
  return onOkRestResponse({ ctx: c, data });
});

leaderboardRoutes.get("/alltime", async (c) => {
  const limit = Number(c.req.query("limit")) || 100;
  const data = await getLeaderboard(null, limit);
  return onOkRestResponse({ ctx: c, data });
});
