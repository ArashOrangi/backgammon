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
  onValidationsRestResponse,
} from "@/responses/response-builder";
import { OrmState } from "@/models/enums";
import { validator } from "@/components/validator";
import {
  TimerPresetCreateSchema,
  TimerPresetUpdateSchema,
  TimerPresetIdSchema,
} from "@/validations/timer.schema";

export const timerConfigRoutes = new Hono();

// ===== دریافت همه preset ها =====
timerConfigRoutes.get("/", async (ctx) => {
  try {
    const presets = await getAllTimerPresets();
    if (presets === OrmState.Error) {
      return onErrorRestResponse({
        ctx,
        errorMessage: "Failed to fetch presets",
      });
    }
    return onOkRestResponse({ ctx, data: presets });
  } catch (error) {
    return onErrorRestResponse({
      ctx,
      errorMessage: "Failed to fetch presets",
    });
  }
});

// ===== ایجاد preset جدید =====
timerConfigRoutes.post("/", async (ctx) => {
  try {
    const body = await ctx.req.json();
    const validation = validator({
      data: body,
      schema: TimerPresetCreateSchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({ ctx, validations: validation.errors });
    }

    // تبدیل undefined به null برای سازگاری با تایپ مدل
    const createData = {
      name: validation.data.name,
      primarySeconds: validation.data.primarySeconds,
      secondarySeconds: validation.data.secondarySeconds,
      leagueLevel: validation.data.leagueLevel ?? null,
      gameType: validation.data.gameType ?? null,
      isDefault: validation.data.isDefault ?? false,
    };

    const result = await createTimerPreset(createData);
    if (!result || (result as any).errorType) {
      return onErrorRestResponse({
        ctx,
        errorMessage: "Failed to create preset",
      });
    }
    return onOkRestResponse({ ctx, data: result });
  } catch (error) {
    return onErrorRestResponse({
      ctx,
      errorMessage: "Failed to create preset",
    });
  }
});

// ===== بروزرسانی preset =====
timerConfigRoutes.put("/:id", async (ctx) => {
  try {
    const idRaw = ctx.req.param("id");
    const idValidation = validator({
      data: { id: Number(idRaw) },
      schema: TimerPresetIdSchema,
    });
    if (!idValidation.isValid) {
      return onValidationsRestResponse({
        ctx,
        validations: idValidation.errors,
      });
    }

    const id = idValidation.data.id;
    const body = await ctx.req.json();
    const validation = validator({
      data: body,
      schema: TimerPresetUpdateSchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({ ctx, validations: validation.errors });
    }

    // تبدیل undefined به null برای سازگاری با تایپ مدل
    const updateData = {
      ...validation.data,
      leagueLevel: validation.data.leagueLevel ?? null,
      gameType: validation.data.gameType ?? null,
      isDefault: validation.data.isDefault ?? false,
    };

    const result = await updateTimerPreset(id, updateData);
    if (!result || (result as any).errorType) {
      return onErrorRestResponse({
        ctx,
        errorMessage: "Failed to update preset",
      });
    }
    return onOkRestResponse({ ctx, data: result });
  } catch (error) {
    return onErrorRestResponse({
      ctx,
      errorMessage: "Failed to update preset",
    });
  }
});

// ===== حذف preset =====
timerConfigRoutes.delete("/:id", async (ctx) => {
  try {
    const idRaw = ctx.req.param("id");
    const validation = validator({
      data: { id: Number(idRaw) },
      schema: TimerPresetIdSchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({ ctx, validations: validation.errors });
    }

    const id = validation.data.id;
    const result = await deleteTimerPreset(id);
    if (!result || (result as any).errorType) {
      return onErrorRestResponse({
        ctx,
        errorMessage: "Failed to delete preset",
      });
    }
    return onOkRestResponse({ ctx, data: { success: true } });
  } catch (error) {
    return onErrorRestResponse({
      ctx,
      errorMessage: "Failed to delete preset",
    });
  }
});
