import { Hono } from "hono";
import { IMiddlewareAuth } from "@/models/middleware";
import { prismaGameCreate } from "@/models/game";
import { addToMatchmaking } from "@/models/matchmaking";
import {
  onOkRestResponse,
  onErrorRestResponse,
  onValidationsRestResponse,
} from "@/responses/response-builder";
import { OrmState } from "@/models/enums";
import { middlewareAuth } from "@/middlewares/middlewareAuth";
import { validator } from "@/components/validator";
import { CreateGameSchema, JoinGameSchema } from "@/validations/game.schema";

export const gameRoutes = new Hono<IMiddlewareAuth>();

// ===== ایجاد بازی (با middlewareAuth) =====
gameRoutes.post("/", middlewareAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "User not authenticated",
    });
  }

  const body = await c.req.json();
  const validation = validator({ data: body, schema: CreateGameSchema });
  if (!validation.isValid) {
    return onValidationsRestResponse({
      ctx: c,
      validations: validation.errors,
    });
  }

  const { whitePlayerId } = validation.data;

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

// ===== پیوستن به صف مچ‌میکینگ =====
gameRoutes.post("/join", middlewareAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "User not authenticated",
    });
  }

  const body = await c.req.json();
  const validation = validator({ data: body, schema: JoinGameSchema });
  if (!validation.isValid) {
    return onValidationsRestResponse({
      ctx: c,
      validations: validation.errors,
    });
  }

  const { userId, roomType } = validation.data;

  try {
    const gameId = await addToMatchmaking(userId, roomType);
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
