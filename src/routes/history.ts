import { Hono } from "hono";
import { IMiddlewareAuth } from "@/models/middleware";
import {
  onErrorRestResponse,
  onOkRestResponse,
  onValidationsRestResponse,
} from "@/responses/response-builder";
import { prismaGameEventsFind } from "@/models/gameEvent";
import { messageError } from "@/static/messageError";
import { OrmState } from "@/models/enums";
import { loadGameStateUntil } from "@/game/eventStore";
import { eventToTimeline } from "@/game/eventTimeline";
import { middlewareAuth } from "@/middlewares/middlewareAuth";
import { validator } from "@/components/validator";
import {
  GetHistorySchema,
  ReplaySchema,
  TimelineSchema,
} from "@/validations/history.schema";

export const history = new Hono<IMiddlewareAuth>();

// ===== دریافت رویدادهای خام یک بازی =====
history.get("/:gameId", middlewareAuth, async (ctx) => {
  try {
    // اعتبارسنجی پارامتر gameId
    const gameIdRaw = ctx.req.param("gameId");
    const validation = validator({
      data: { gameId: Number(gameIdRaw) },
      schema: GetHistorySchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({ ctx, validations: validation.errors });
    }

    const gameId = validation.data.gameId;
    const events = await prismaGameEventsFind(gameId);
    if (!events || events === OrmState.Error) {
      return onErrorRestResponse({
        ctx,
        errorMessage: "Game history not found",
      });
    }
    return onOkRestResponse({ ctx, data: { gameId, events } });
  } catch (error) {
    return onErrorRestResponse({
      ctx,
      errorMessage: messageError.gameHistory.find,
    });
  }
});

// ===== بازپخش وضعیت بازی تا یک sequence مشخص =====
history.get("/:gameId/replay", middlewareAuth, async (ctx) => {
  try {
    const gameIdRaw = ctx.req.param("gameId");
    const untilQuery = ctx.req.query("until");

    // اعتبارسنجی پارامترها
    const dataToValidate: any = { gameId: Number(gameIdRaw) };
    if (untilQuery !== undefined) {
      dataToValidate.until = Number(untilQuery);
    }

    const validation = validator({
      data: dataToValidate,
      schema: ReplaySchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({ ctx, validations: validation.errors });
    }

    const { gameId, until } = validation.data;
    const state = await loadGameStateUntil(gameId, until);
    if (!state) {
      return onErrorRestResponse({ ctx, errorMessage: "Game state not found" });
    }
    return onOkRestResponse({ ctx, data: state });
  } catch (error) {
    return onErrorRestResponse({
      ctx,
      errorMessage: messageError.gameHistory.general,
    });
  }
});

// ===== دریافت تایم‌لاین خوانا از رویدادها =====
history.get("/:gameId/timeline", middlewareAuth, async (ctx) => {
  try {
    const gameIdRaw = ctx.req.param("gameId");
    const validation = validator({
      data: { gameId: Number(gameIdRaw) },
      schema: TimelineSchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({ ctx, validations: validation.errors });
    }

    const gameId = validation.data.gameId;
    const events = await prismaGameEventsFind(gameId);
    if (!events || events === OrmState.Error) {
      return onErrorRestResponse({
        ctx,
        errorMessage: "Game timeline not found",
      });
    }
    const timeline = events.map(eventToTimeline);
    return onOkRestResponse({ ctx, data: timeline });
  } catch (error) {
    return onErrorRestResponse({
      ctx,
      errorMessage: messageError.gameHistory.general,
    });
  }
});
