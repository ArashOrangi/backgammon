import { Hono } from "hono";
import { IMiddlewareAuth } from "@/models/middleware";
import { onOkRestResponse } from "@/responses/response-builder";
import { getLeaderboard } from "@/services/leaderboard";
import { middlewareAuth } from "@/middlewares/middlewareAuth";

export const leaderboardRoutes = new Hono<IMiddlewareAuth>();

leaderboardRoutes.get("/weekly", middlewareAuth, async (c) => {
  try {
    const limit = Number(c.req.query("limit")) || 100;
    const data = await getLeaderboard(7, limit);
    return onOkRestResponse({ ctx: c, data: data || [] });
  } catch (error) {
    console.error("[Leaderboard] Weekly error:", error);
    // همیشه ۲۰۰ با آرایه خالی
    return onOkRestResponse({ ctx: c, data: [] });
  }
});

leaderboardRoutes.get("/monthly", middlewareAuth, async (c) => {
  try {
    const limit = Number(c.req.query("limit")) || 100;
    const data = await getLeaderboard(30, limit);
    return onOkRestResponse({ ctx: c, data: data || [] });
  } catch (error) {
    console.error("[Leaderboard] Monthly error:", error);
    return onOkRestResponse({ ctx: c, data: [] });
  }
});

leaderboardRoutes.get("/alltime", middlewareAuth, async (c) => {
  try {
    const limit = Number(c.req.query("limit")) || 100;
    const data = await getLeaderboard(null, limit);
    return onOkRestResponse({ ctx: c, data: data || [] });
  } catch (error) {
    console.error("[Leaderboard] All-time error:", error);
    return onOkRestResponse({ ctx: c, data: [] });
  }
});

leaderboardRoutes.get(
  "/tournament/:tournamentId",
  middlewareAuth,
  async (c) => {
    return onOkRestResponse({
      ctx: c,
      data: [],
      message: "Tournament leaderboard not implemented yet",
    });
  },
);
