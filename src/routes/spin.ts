import { Hono } from "hono";
import { IMiddlewareAuth } from "@/models/middleware";
import {
  onOkRestResponse,
  onErrorRestResponse,
} from "@/responses/response-builder";
import { middlewareAuth } from "@/middlewares/middlewareAuth";
import { SpinService } from "@/services/spinService";

export const spinRoutes = new Hono<IMiddlewareAuth>();
const spinService = new SpinService();

/**
 * GET /spin/config
 * دریافت تنظیمات گردونه (جدول جوایز، هزینه، محدودیت روزانه)
 */
spinRoutes.get("/config", async (c) => {
  try {
    const config = spinService.getConfig();
    return onOkRestResponse({ ctx: c, data: config });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch spin config",
    });
  }
});

/**
 * POST /spin
 * انجام چرخش (نیاز به احراز هویت)
 */
spinRoutes.post("/", middlewareAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Not authenticated" });
  }

  try {
    const result = await spinService.spin(user.id);
    return onOkRestResponse({
      ctx: c,
      data: result,
      message: `🎉 You won ${result.wonCoin} coins!`,
    });
  } catch (error: any) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: error.message || "Spin failed",
    });
  }
});

/**
 * GET /spin/history
 * دریافت تاریخچه چرخش‌های کاربر
 */
spinRoutes.get("/history", middlewareAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Not authenticated" });
  }

  try {
    const limit = Number(c.req.query("limit")) || 20;
    const history = await spinService.getHistory(user.id, limit);
    return onOkRestResponse({ ctx: c, data: history });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch spin history",
    });
  }
});

/**
 * GET /spin/today
 * دریافت تعداد چرخش‌های امروز کاربر
 */
spinRoutes.get("/today", middlewareAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Not authenticated" });
  }

  try {
    const stats = await spinService.getTodayStats(user.id);
    return onOkRestResponse({ ctx: c, data: stats });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch today's spin stats",
    });
  }
});
