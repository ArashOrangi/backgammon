import { Hono } from "hono";
import { IMiddlewareAuth } from "@/models/middleware";
import {
  onOkRestResponse,
  onErrorRestResponse,
  onValidationsRestResponse,
} from "@/responses/response-builder";
import { getLeaderboard } from "@/services/leaderboard";
import { middlewareAuth } from "@/middlewares/middlewareAuth";
import { validator } from "@/components/validator";
import {
  LeaderboardQuerySchema,
  TournamentLeaderboardSchema,
} from "@/validations/leaderboard.schema";

export const leaderboardRoutes = new Hono<IMiddlewareAuth>();

// ===== دریافت لیدربورد هفتگی =====
leaderboardRoutes.get("/weekly", middlewareAuth, async (c) => {
  try {
    const query = c.req.query();
    const validation = validator({
      data: { limit: query.limit ? Number(query.limit) : undefined },
      schema: LeaderboardQuerySchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: c,
        validations: validation.errors,
      });
    }

    const limit = validation.data.limit || 100;
    const data = await getLeaderboard(7, limit);
    return onOkRestResponse({ ctx: c, data: data || [] });
  } catch (error) {
    console.error("[Leaderboard] Weekly error:", error);
    return onOkRestResponse({ ctx: c, data: [] });
  }
});

// ===== دریافت لیدربورد ماهانه =====
leaderboardRoutes.get("/monthly", middlewareAuth, async (c) => {
  try {
    const query = c.req.query();
    const validation = validator({
      data: { limit: query.limit ? Number(query.limit) : undefined },
      schema: LeaderboardQuerySchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: c,
        validations: validation.errors,
      });
    }

    const limit = validation.data.limit || 100;
    const data = await getLeaderboard(30, limit);
    return onOkRestResponse({ ctx: c, data: data || [] });
  } catch (error) {
    console.error("[Leaderboard] Monthly error:", error);
    return onOkRestResponse({ ctx: c, data: [] });
  }
});

// ===== دریافت لیدربورد کل زمان =====
leaderboardRoutes.get("/alltime", middlewareAuth, async (c) => {
  try {
    const query = c.req.query();
    const validation = validator({
      data: { limit: query.limit ? Number(query.limit) : undefined },
      schema: LeaderboardQuerySchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: c,
        validations: validation.errors,
      });
    }

    const limit = validation.data.limit || 100;
    const data = await getLeaderboard(null, limit);
    return onOkRestResponse({ ctx: c, data: data || [] });
  } catch (error) {
    console.error("[Leaderboard] All-time error:", error);
    return onOkRestResponse({ ctx: c, data: [] });
  }
});

// ===== دریافت لیدربورد تورنمنت (موقتاً غیرفعال) =====
leaderboardRoutes.get(
  "/tournament/:tournamentId",
  middlewareAuth,
  async (c) => {
    try {
      const tournamentIdRaw = c.req.param("tournamentId");
      const validation = validator({
        data: { tournamentId: Number(tournamentIdRaw) },
        schema: TournamentLeaderboardSchema,
      });
      if (!validation.isValid) {
        return onValidationsRestResponse({
          ctx: c,
          validations: validation.errors,
        });
      }

      // TODO: پیاده‌سازی واقعی لیدربورد تورنمنت
      return onOkRestResponse({
        ctx: c,
        data: [],
        message: "Tournament leaderboard not implemented yet",
      });
    } catch (error) {
      return onErrorRestResponse({
        ctx: c,
        errorMessage: "Failed to fetch tournament leaderboard",
      });
    }
  },
);
