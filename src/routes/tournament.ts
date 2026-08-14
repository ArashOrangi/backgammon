import { Hono } from "hono";
import { prisma } from "@/components/prisma";
import {
  onOkRestResponse,
  onErrorRestResponse,
  onValidationsRestResponse,
} from "@/responses/response-builder";
import { middlewareAuth } from "@/middlewares/middlewareAuth";
import { MonthlyTournamentService } from "@/services/tournament/monthly";
import { WeeklyTournamentService } from "@/services/tournament/weekly";
import { TournamentType } from "@prisma/client";
import { validator } from "@/components/validator";
import {
  GetCurrentSeasonSchema,
  GetLeaderboardSchema,
  GetMonthlyHistorySchema,
} from "@/validations/tournament.schema";
import { getTicketInfo } from "@/services/tournament/ticket.service";

const tournamentRoutes = new Hono();
const monthlyService = new MonthlyTournamentService();
const weeklyService = new WeeklyTournamentService();

// ===== اطلاعات فصل جاری =====
tournamentRoutes.get("/current/:type", async (c) => {
  try {
    const typeRaw = c.req.param("type");
    const validation = validator({
      data: { type: typeRaw as TournamentType },
      schema: GetCurrentSeasonSchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: c,
        validations: validation.errors,
      });
    }

    const type = validation.data.type;
    const season = await monthlyService.getCurrentSeason(type);
    return onOkRestResponse({ ctx: c, data: season });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch current season",
    });
  }
});

// ===== لیدربورد ماهانه =====
tournamentRoutes.get("/monthly/leaderboard/:seasonId", async (c) => {
  try {
    const seasonIdRaw = c.req.param("seasonId");
    const limitRaw = c.req.query("limit");

    const dataToValidate = {
      seasonId: Number(seasonIdRaw),
      limit: limitRaw ? Number(limitRaw) : undefined,
    };

    const validation = validator({
      data: dataToValidate,
      schema: GetLeaderboardSchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: c,
        validations: validation.errors,
      });
    }

    const { seasonId, limit } = validation.data;
    const data = await monthlyService.getFinalLeaderboard(
      seasonId,
      limit || 100,
    );
    return onOkRestResponse({ ctx: c, data });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch monthly leaderboard",
    });
  }
});

// ===== لیدربورد هفتگی =====
tournamentRoutes.get("/weekly/leaderboard/:seasonId", async (c) => {
  try {
    const seasonIdRaw = c.req.param("seasonId");
    const limitRaw = c.req.query("limit");

    const dataToValidate = {
      seasonId: Number(seasonIdRaw),
      limit: limitRaw ? Number(limitRaw) : undefined,
    };

    const validation = validator({
      data: dataToValidate,
      schema: GetLeaderboardSchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: c,
        validations: validation.errors,
      });
    }

    const { seasonId, limit } = validation.data;
    const data = await weeklyService.getLeaderboard(seasonId, limit || 100);
    return onOkRestResponse({ ctx: c, data });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch weekly leaderboard",
    });
  }
});

// ===== سری فعال ماهانه (برای کاربر جاری) =====
tournamentRoutes.get("/monthly/active", middlewareAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Unauthorized" });
  }

  try {
    const series = await prisma.tournamentSeries.findFirst({
      where: { playerId: user.id, status: "ACTIVE" },
      include: { games: true },
    });
    return onOkRestResponse({ ctx: c, data: series || null });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch active series",
    });
  }
});

// ===== تاریخچه سری‌های ماهانه یک بازیکن =====
tournamentRoutes.get("/monthly/history/:playerId", async (c) => {
  try {
    const playerIdRaw = c.req.param("playerId");
    const seasonIdRaw = c.req.query("seasonId");

    const dataToValidate = {
      playerId: Number(playerIdRaw),
      seasonId: seasonIdRaw ? Number(seasonIdRaw) : undefined,
    };

    const validation = validator({
      data: dataToValidate,
      schema: GetMonthlyHistorySchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: c,
        validations: validation.errors,
      });
    }

    const { playerId, seasonId } = validation.data;
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
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch series history",
    });
  }
});

// ===== موجودی بلیط طلایی =====
tournamentRoutes.get("/ticket/balance", middlewareAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Unauthorized" });
  }

  try {
    const ticket = await prisma.userTicket.findUnique({
      where: { userId: user.id },
    });
    return onOkRestResponse({
      ctx: c,
      data: { balance: ticket?.balance || 0 },
    });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch ticket balance",
    });
  }
});

tournamentRoutes.get("/ticket/info", middlewareAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Unauthorized" });
  }
  try {
    const info = await getTicketInfo(user.id);
    return onOkRestResponse({ ctx: c, data: info });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch ticket info",
    });
  }
});

tournamentRoutes.get("/weekly/stats", middlewareAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Unauthorized" });
  }

  try {
    // دریافت فصل فعال هفتگی
    const season = await weeklyService.getCurrentSeason("WEEKLY");
    if (!season) {
      return onErrorRestResponse({
        ctx: c,
        errorMessage: "No active weekly season",
      });
    }

    const stats = await weeklyService.getPlayerStats(user.id, season.id);
    return onOkRestResponse({ ctx: c, data: stats });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch weekly stats",
    });
  }
});

export { tournamentRoutes };
