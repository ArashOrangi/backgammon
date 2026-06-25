import { Hono } from "hono";
import { IMiddlewareAuth } from "@/models/middleware";
import { prismaGameCreate } from "@/models/game";
import { addToMatchmaking } from "@/models/matchmaking";
import {
  onOkRestResponse,
  onErrorRestResponse,
} from "@/responses/response-builder";
import { OrmState } from "@/models/enums";
import { middlewareAuth } from "@/middlewares/middlewareAuth";

export const gameRoutes = new Hono<IMiddlewareAuth>();

// ایجاد بازی (با middlewareAuth)
gameRoutes.post("/", middlewareAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "User not authenticated",
    });
  }

  const { whitePlayerId } = await c.req.json();
  if (!whitePlayerId) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "whitePlayerId required",
    });
  }

  const result = await prismaGameCreate(whitePlayerId);
  if (!result || result === OrmState.Error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to create game",
    });
  }

  const isWhite = result.whitePlayerId != null;
  return onOkRestResponse({ ctx: c, data: result, extra: { isWhite } });
});

// پیوستن به صف مچ‌میکینگ
gameRoutes.post("/join", middlewareAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "User not authenticated",
    });
  }

  const { userId } = await c.req.json();
  if (!userId) {
    return onErrorRestResponse({ ctx: c, errorMessage: "userId required" });
  }

  try {
    const gameId = await addToMatchmaking(userId);
    if (gameId === 0) {
      return onOkRestResponse({
        ctx: c,
        data: { status: "waiting", message: "Added to matchmaking queue" },
      });
    } else {
      return onOkRestResponse({
        ctx: c,
        data: { gameId, status: "matched", message: "Opponent found" },
      });
    }
  } catch (err) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Matchmaking failed" });
  }
});
