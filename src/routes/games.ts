import { Hono } from "hono";
import { prismaGameCreate } from "@/models/game";
import {
  onOkRestResponse,
  onErrorRestResponse,
} from "@/responses/response-builder";
import { OrmState } from "@/models/enums";

export const gameRoutes = new Hono();

gameRoutes.post("/", async (c) => {
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
  // const isWhite = result.whitePlayerId != null ? true : false;
  const isWhite = result.whitePlayerId != null;
  return onOkRestResponse({
    ctx: c,
    data: result,
    extra: { isWhite, isBlack: !isWhite },
  });
});
