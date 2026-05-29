import { Hono } from "hono";
import {
  getAllTimerPresets,
  createTimerPreset,
  updateTimerPreset,
  deleteTimerPreset,
} from "@/models/timerPreset";
import {
  onOkRestResponse,
  onErrorRestResponse,
} from "@/responses/response-builder";
import { OrmState } from "@/models/enums";

export const timerConfigRoutes = new Hono();

// دریافت همه preset ها
timerConfigRoutes.get("/", async (ctx) => {
  const presets = await getAllTimerPresets();
  if (presets === OrmState.Error) {
    return onErrorRestResponse({
      ctx,
      errorMessage: "Failed to fetch presets",
    });
  }
  return onOkRestResponse({ ctx, data: presets });
});

// ایجاد preset جدید
timerConfigRoutes.post("/", async (ctx) => {
  const body = await ctx.req.json();
  const {
    name,
    primarySeconds,
    secondarySeconds,
    leagueLevel,
    gameType,
    isDefault,
  } = body;
  if (
    !name ||
    typeof primarySeconds !== "number" ||
    typeof secondarySeconds !== "number"
  ) {
    return onErrorRestResponse({ ctx, errorMessage: "Invalid input" });
  }
  const result = await createTimerPreset({
    name,
    primarySeconds,
    secondarySeconds,
    leagueLevel: leagueLevel || null,
    gameType: gameType || null,
    isDefault: isDefault || false,
  });
  if (!result || (result as any).errorType) {
    return onErrorRestResponse({
      ctx,
      errorMessage: "Failed to create preset",
    });
  }
  return onOkRestResponse({ ctx, data: result });
});

// بروزرسانی preset
timerConfigRoutes.put("/:id", async (ctx) => {
  const id = Number(ctx.req.param("id"));
  const body = await ctx.req.json();
  const result = await updateTimerPreset(id, body);
  if (!result || (result as any).errorType) {
    return onErrorRestResponse({
      ctx,
      errorMessage: "Failed to update preset",
    });
  }
  return onOkRestResponse({ ctx, data: result });
});

// حذف preset
timerConfigRoutes.delete("/:id", async (ctx) => {
  const id = Number(ctx.req.param("id"));
  const result = await deleteTimerPreset(id);
  if (!result || (result as any).errorType) {
    return onErrorRestResponse({
      ctx,
      errorMessage: "Failed to delete preset",
    });
  }
  return onOkRestResponse({ ctx, data: { success: true } });
});
