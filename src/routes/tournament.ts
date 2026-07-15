import { Hono } from "hono";
import { prisma } from "@/components/prisma";
import {
  onOkRestResponse,
  onErrorRestResponse,
} from "@/responses/response-builder";
import { middlewareAuth } from "@/middlewares/middlewareAuth";
import { MonthlyTournamentService } from "@/services/tournament/monthly";
import { WeeklyTournamentService } from "@/services/tournament/weekly";
import { TournamentType } from "@prisma/client";

const tournamentRoutes = new Hono();
const monthlyService = new MonthlyTournamentService();
const weeklyService = new WeeklyTournamentService();

// ---------- اطلاعات فصل جاری ----------
tournamentRoutes.get("/current/:type", async (c) => {
  const type = c.req.param("type") as TournamentType;
  const season = await monthlyService.getCurrentSeason(type); // یا weeklyService
  return onOkRestResponse({ ctx: c, data: season });
});

// ---------- لیدربورد ماهانه ----------
tournamentRoutes.get("/monthly/leaderboard/:seasonId", async (c) => {
  const seasonId = Number(c.req.param("seasonId"));
  const limit = Number(c.req.query("limit")) || 100;
  const data = await monthlyService.getFinalLeaderboard(seasonId, limit);
  return onOkRestResponse({ ctx: c, data });
});

// ---------- لیدربورد هفتگی ----------
tournamentRoutes.get("/weekly/leaderboard/:seasonId", async (c) => {
  const seasonId = Number(c.req.param("seasonId"));
  const limit = Number(c.req.query("limit")) || 100;
  const data = await weeklyService.getLeaderboard(seasonId, limit);
  return onOkRestResponse({ ctx: c, data });
});

// ---------- سری فعال ماهانه (برای کاربر جاری) ----------
tournamentRoutes.get("/monthly/active", middlewareAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Unauthorized" });
  }

  const series = await prisma.tournamentSeries.findFirst({
    where: { playerId: user.id, status: "ACTIVE" },
    include: { games: true },
  });
  return onOkRestResponse({ ctx: c, data: series || null });
});

// ---------- تاریخچه سری‌های ماهانه یک بازیکن ----------
tournamentRoutes.get("/monthly/history/:playerId", async (c) => {
  const playerId = Number(c.req.param("playerId"));
  const seasonId = c.req.query("seasonId")
    ? Number(c.req.query("seasonId"))
    : undefined;
  const series = await prisma.tournamentSeries.findMany({
    where: {
      playerId,
      seasonId,
      isRecorded: true,
    },
    orderBy: { startedAt: "desc" },
    include: { games: true },
  });
  return onOkRestResponse({ ctx: c, data: series });
});

// ---------- موجودی بلیط طلایی ----------
tournamentRoutes.get("/ticket/balance", middlewareAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Unauthorized" });
  }

  const ticket = await prisma.userTicket.findUnique({
    where: { userId: user.id },
  });
  return onOkRestResponse({ ctx: c, data: { balance: ticket?.balance || 0 } });
});

export { tournamentRoutes };
