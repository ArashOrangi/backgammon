import { Hono } from "hono";
import { prisma } from "@/components/prisma";
import { processGameCompletion } from "@/services/gameCompletion";
import { ensureRoomPreset } from "@/models/matchmaking";
import { BOT_USER_ID } from "@/static/statics";
import { GameState } from "@/game/types";
import { RoomType, MatchResultType } from "@prisma/client";

const debugRoutes = new Hono();

/**
 * POST /api/debug/simulate-game
 * شبیه‌سازی نتیجه یک بازی برای تست Progression و Economy
 *
 * Body:
 * {
 *   "userId": 123,
 *   "roomType": "ROOM1",
 *   "result": "win",      // یا "loss"
 *   "winType": "normal"   // اختیاری: "normal" | "mars" | "backgammon"
 * }
 */
debugRoutes.post("/simulate-game", async (c) => {
  // ✅ فقط در محیط توسعه فعال است
  if (process.env.NODE_ENV === "production") {
    return c.json({ error: "Debug endpoint not available in production" }, 403);
  }

  const body = await c.req.json();
  const { userId, roomType, result, winType = "normal" } = body;

  // اعتبارسنجی ورودی
  if (!userId || !roomType || !result) {
    return c.json(
      { error: "Missing required fields: userId, roomType, result" },
      400,
    );
  }
  if (!["win", "loss"].includes(result)) {
    return c.json({ error: "result must be 'win' or 'loss'" }, 400);
  }
  if (!Object.values(RoomType).includes(roomType as RoomType)) {
    return c.json({ error: "Invalid roomType" }, 400);
  }

  const opponentId = BOT_USER_ID;

  // بررسی وجود کاربر
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // 1. ایجاد بازی در جدول Games
  const game = await prisma.games.create({
    data: {
      whitePlayerId: userId,
      blackPlayerId: opponentId,
      status: "FINISHED",
    },
  });

  // 2. اطمینان از وجود RoomPreset
  const roomPresetId = await ensureRoomPreset(roomType as RoomType);

  // 3. ایجاد MatchRecord
  const matchRecord = await prisma.matchRecord.create({
    data: {
      roomPresetId,
      gameId: game.id,
      startMatch: new Date(),
      endMatch: new Date(),
      matchLength: 5,
    },
  });

  // 4. تعیین برنده و بازنده
  const isUserWinner = result === "win";
  const winnerId = isUserWinner ? userId : opponentId;
  const loserId = isUserWinner ? opponentId : userId;

  // نگاشت winType به MatchResultType
  const mapWinType = (type: string): MatchResultType => {
    switch (type) {
      case "mars":
        return MatchResultType.gammon;
      case "backgammon":
        return MatchResultType.backgammon;
      default:
        return MatchResultType.normal;
    }
  };

  // 5. ایجاد شرکت‌کنندگان
  await prisma.matchParticipent.createMany({
    data: [
      {
        matchRecordId: matchRecord.id,
        playerId: userId,
        side: true,
        result: isUserWinner,
        resultType: isUserWinner ? mapWinType(winType) : MatchResultType.loss,
        hits: 3,
      },
      {
        matchRecordId: matchRecord.id,
        playerId: opponentId,
        side: false,
        result: !isUserWinner,
        resultType: !isUserWinner ? mapWinType(winType) : MatchResultType.loss,
        hits: 1,
      },
    ],
  });

  // 6. ساخت یک GameState مینیمال برای پردازش
  const state: GameState = {
    id: game.id,
    players: [
      { id: userId, color: "white" },
      { id: opponentId, color: "black" },
    ],
    turn: null,
    status: "finished",
    winner: winnerId,
    winType: winType as any, // "normal" | "mars" | "backgammon"
    roomType: roomType as RoomType,
    board: {
      points: Array.from({ length: 24 }, () => ({ owner: null, count: 0 })),
      bar: {},
      borneOff: {},
    },
    pipCount: {},
    doublingCubeEnabled: true,
    cubeValue: 1,
    cubeOwner: null,
    cubeOfferedBy: null,
    cubeOfferedTo: null,
    cubeOfferedValue: null,
    createdAt: Date.now(),
    lastActionAt: Date.now(),
    primaryTimePerTurn: 60,
    secondaryTimeBank: {},
    secondaryTimeTotal: {},
    rolledThisTurn: false,
  };

  // 7. اجرای پردازش کامل پایان بازی (XP, Economy, Leaderboard, MatchRecord)
  await processGameCompletion(game.id, state);

  // 8. دریافت اطلاعات به‌روز شده برای بازگشت به کلاینت
  const updatedStats = await prisma.userStats.findUnique({
    where: { userId },
  });
  const xpHistory = await prisma.xPHistory.findFirst({
    where: { userId, gameId: game.id },
    orderBy: { createdAt: "desc" },
  });
  const lbRecords = await prisma.matchLBRecord.findMany({
    where: { gameId: game.id },
  });

  return c.json({
    success: true,
    gameId: game.id,
    userId,
    result,
    winType,
    stats: updatedStats,
    xpHistory,
    lbRecords,
  });
});

export { debugRoutes };
