// routes/history.ts
// تغییرات جزئی - فقط استفاده از middlewareAuth

import { Hono } from "hono";
import { IMiddlewareAuth } from "@/models/middleware";
import {
  onErrorRestResponse,
  onOkRestResponse,
} from "@/responses/response-builder";
import { prismaGameEventsFind } from "@/models/gameEvent";
import { messageError } from "@/static/messageError";
import { OrmState } from "@/models/enums";
import { loadGameStateUntil } from "@/game/eventStore";
import { eventToTimeline } from "@/game/eventTimeline";
import { middlewareAuth } from "@/middlewares/middlewareAuth";

export const history = new Hono<IMiddlewareAuth>();

history.get("/:gameId", middlewareAuth, async (ctx) => {
  try {
    const gameId = Number(ctx.req.param("gameId"));
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

history.get("/:gameId/replay", middlewareAuth, async (ctx) => {
  try {
    const gameId = Number(ctx.req.param("gameId"));
    const untilQuery = ctx.req.query("until");
    const until = untilQuery ? Number(untilQuery) : undefined;
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

history.get("/:gameId/timeline", middlewareAuth, async (ctx) => {
  try {
    const gameId = Number(ctx.req.param("gameId"));
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
