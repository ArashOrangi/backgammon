import { Hono } from "hono";
import { prismaGameCreate } from "@/models/game";
import {
  onOkRestResponse,
  onErrorRestResponse,
} from "@/responses/response-builder";
import { OrmState } from "@/models/enums";
import { addToMatchmaking } from "@/models/matchmaking";
import { RoomType } from "@prisma/client";

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
  const isWhite = result.whitePlayerId != null;
  return onOkRestResponse({
    ctx: c,
    data: result,
    extra: { isWhite },
  });
});

gameRoutes.post("/join", async (c) => {
  const { userId, roomType } = await c.req.json();
  if (!userId) {
    return onErrorRestResponse({ ctx: c, errorMessage: "userId required" });
  }
  // انتخاب اتاق پیش‌فرض در صورت عدم ارسال
  const selectedRoom = (roomType as RoomType) ?? RoomType.CASUAL_1;
  try {
    const gameId = await addToMatchmaking(userId, selectedRoom);
    if (gameId === 0) {
      // در صف قرار گرفت
      return onOkRestResponse({
        ctx: c,
        data: { status: "waiting", message: "Added to matchmaking queue" },
      });
    } else {
      // جفت شد
      return onOkRestResponse({
        ctx: c,
        data: { gameId, status: "matched", message: "Opponent found" },
      });
    }
  } catch (err) {
    console.error("Matchmaking error:", err);
    return onErrorRestResponse({ ctx: c, errorMessage: "Matchmaking failed" });
  }
});
