import { prisma } from "@/components/prisma";
import { GameState } from "@/game/types";
import { RoomType } from "@prisma/client";
import { BOT_USER_ID } from "@/static/statics";

/**
 * محاسبه و اعمال XP برای هر دو بازیکن پس از پایان بازی
 */
export async function calculateAndApplyXP(gameId: number, state: GameState) {
  try {
    // 1. دریافت اطلاعات بازی و اتاق
    const game = await prisma.games.findUnique({
      where: { id: gameId },
      include: { matchRecords: { include: { roomPreset: true } } },
    });

    if (!game) {
      console.error(`[Progression] Game ${gameId} not found`);
      return;
    }

    const roomPreset = game.matchRecords[0]?.roomPreset;
    if (!roomPreset) {
      console.error(`[Progression] Room preset not found for game ${gameId}`);
      return;
    }

    const baseWinXP = roomPreset.baseWinXP ?? 10;
    const baseLoseXP = roomPreset.baseLoseXP ?? 5;
    const cap = roomPreset.bonusCap ?? 8;

    // 2. تشخیص برنده و بازنده از state
    const winnerId = state.winner;
    if (!winnerId) {
      console.error(`[Progression] No winner found for game ${gameId}`);
      return;
    }

    const loserId = state.players.find((p) => p.id !== winnerId)?.id;
    if (!loserId) {
      console.error(`[Progression] Loser not found for game ${gameId}`);
      return;
    }

    // 3. تشخیص Win Type از state
    const winType = state.winType || "normal";
    const winTypeBonus = getWinTypeBonus(winType);

    // ۴. Base XP
    const winnerBaseXP = baseWinXP;
    const loserBaseXP = baseLoseXP;

    // ۵. محاسبه پاداش حرکات خاص از رویدادها
    const events = await prisma.gameEvents.findMany({
      where: {
        gameId,
        isUndo: false,
        type: { in: ["MOVE_APPLIED", "TURN_PASSED", "CUBE_ACCEPTED"] },
      },
      orderBy: { sequence: "asc" },
    });

    const actionBonuses = calculateActionBonuses(events, winnerId, loserId);
    const cappedWinnerActionBonus = Math.min(actionBonuses.winner, cap);
    const cappedLoserActionBonus = Math.min(actionBonuses.loser, cap);

    // ۶. XP کل
    const winnerTotalXP = winnerBaseXP + winTypeBonus + cappedWinnerActionBonus;
    const loserTotalXP = loserBaseXP + cappedLoserActionBonus;

    // ۷. به‌روزرسانی UserStats
    await updateUserXP(winnerId, winnerTotalXP, gameId);
    await updateUserXP(loserId, loserTotalXP, gameId);

    // ۸. ذخیره در XPHistory
    await prisma.xPHistory.create({
      data: {
        userId: winnerId,
        gameId,
        baseXP: winnerBaseXP,
        winBonus: winTypeBonus,
        actionBonus: cappedWinnerActionBonus,
        totalXP: winnerTotalXP,
      },
    });

    await prisma.xPHistory.create({
      data: {
        userId: loserId,
        gameId,
        baseXP: loserBaseXP,
        winBonus: 0,
        actionBonus: cappedLoserActionBonus,
        totalXP: loserTotalXP,
      },
    });

    console.log(
      `[Progression] Game ${gameId} processed: Winner ${winnerId} +${winnerTotalXP}XP, Loser ${loserId} +${loserTotalXP}XP`,
    );
  } catch (error) {
    console.error("[Progression] Error:", error);
  }
}

/**
 * محاسبه پاداش Win Type
 */
function getWinTypeBonus(winType: string): number {
  switch (winType) {
    case "mars":
      return 2;
    case "backgammon":
      return 4;
    case "normal":
    default:
      return 0;
  }
}

/**
 * محاسبه پاداش حرکات خاص از رویدادها
 */
function calculateActionBonuses(
  events: any[],
  winnerId: number,
  loserId: number,
): { winner: number; loser: number } {
  let winnerBonus = 0;
  let loserBonus = 0;
  let hitCount = 0;
  let cubeWinBonus = 0;

  for (const event of events) {
    if (event.type === "MOVE_APPLIED") {
      const payload = event.payload as any;
      if (payload.hitOpponentId) {
        const hitterId = payload.playerId;
        if (hitterId === winnerId && hitCount < 2) {
          winnerBonus += 1;
          hitCount++;
        } else if (hitterId === loserId && hitCount < 2) {
          loserBonus += 1;
          hitCount++;
        }
      }
    }

    if (event.type === "CUBE_ACCEPTED") {
      if (cubeWinBonus === 0) {
        winnerBonus += 2;
        cubeWinBonus = 1;
      }
    }
  }

  return { winner: winnerBonus, loser: loserBonus };
}

/**
 * به‌روزرسانی XP و Level کاربر
 * - اگر کاربر بات باشد، عملیات را نادیده می‌گیرد.
 * - اگر UserStats وجود نداشته باشد، یک رکورد جدید با مقادیر پیش‌فرض ایجاد می‌کند.
 */
async function updateUserXP(userId: number, xpGained: number, gameId: number) {
  // اگر کاربر بات است، نیازی به XP ندارد
  if (userId === BOT_USER_ID) {
    console.log(`[Progression] Skipping XP for bot user ${userId}`);
    return;
  }

  let userStats = await prisma.userStats.findUnique({
    where: { userId },
  });

  // اگر UserStats وجود نداشت، یک رکورد جدید ایجاد کن
  if (!userStats) {
    console.warn(
      `[Progression] UserStats not found for user ${userId}, creating new record`,
    );
    userStats = await prisma.userStats.create({
      data: {
        userId,
        xp: 0,
        level: 1,
        coin: 0,
        gem: 0,
      },
    });
  }

  const currentXP = userStats.xp || 0;
  const newXP = currentXP + xpGained;

  // محاسبه Level جدید بر اساس XP
  const levelInterpreter = await prisma.levelIntrepeter.findMany({
    orderBy: { xp: "asc" },
  });

  let newLevel = userStats.level || 1;
  for (const level of levelInterpreter) {
    if (level.cumulativeXP && newXP >= level.cumulativeXP) {
      newLevel = level.level || 1;
    }
  }

  // به‌روزرسانی
  await prisma.userStats.update({
    where: { userId },
    data: {
      xp: newXP,
      level: newLevel,
    },
  });
}

/**
 * دریافت اطلاعات به‌روزرسانی پیشرفت برای ارسال به کلاینت
 */
export async function getProgressionUpdate(userId: number, gameId: number) {
  const userStats = await prisma.userStats.findUnique({
    where: { userId },
  });
  if (!userStats) return null;

  // Find XP history for this specific game (most recent)
  const xpHistory = await prisma.xPHistory.findFirst({
    where: { userId, gameId },
    orderBy: { createdAt: "desc" },
  });

  const gainedXP = xpHistory?.totalXP ?? 0;
  const previousXP = (userStats.xp ?? 0) - gainedXP;

  // Determine previous level using LevelIntrepeter
  const levels = await prisma.levelIntrepeter.findMany({
    orderBy: { xp: "asc" },
  });
  let previousLevel = 1;
  for (const lv of levels) {
    if (lv.cumulativeXP && previousXP >= lv.cumulativeXP) {
      previousLevel = lv.level ?? 1;
    }
  }
  const newLevel = userStats.level ?? 1;

  return {
    userId,
    previousStats: {
      xp: previousXP,
      level: previousLevel,
      coin: userStats.coin ?? 0,
      gem: userStats.gem ?? 0,
    },
    gained: {
      xp: gainedXP,
      coin: 0,
      gem: 0,
    },
    newStats: {
      xp: userStats.xp ?? 0,
      level: newLevel,
      coin: userStats.coin ?? 0,
      gem: userStats.gem ?? 0,
    },
    levelUp: newLevel > previousLevel,
    previousLevel,
    newLevel,
  };
}
