import { prisma } from "@/components/prisma";
import { GameState } from "@/game/types";
import { RoomType } from "@prisma/client";

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
    const spread = roomPreset.spread ?? 5;

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

    // ۴. محاسبه Base XP برای هر بازیکن
    const winnerBaseXP = baseWinXP;
    const loserBaseXP = baseLoseXP;

    // ۵. محاسبه پاداش حرکات خاص از رویدادها
    const events = await prisma.gameEvents.findMany({
      where: {
        gameId,
        isUndo: false,
        type: { in: ["MOVE_APPLIED", "TURN_PASSED"] },
      },
      orderBy: { sequence: "asc" },
    });

    const actionBonuses = calculateActionBonuses(events, winnerId, loserId);
    const winnerActionBonus = actionBonuses.winner;
    const loserActionBonus = actionBonuses.loser;

    // ۶. اعمال Cap بر اساس اتاق (با استفاده از roomType)
    // const cap = getCapByRoom(roomPreset.roomType);
    // const cappedWinnerActionBonus = Math.min(winnerActionBonus, cap);
    // const cappedLoserActionBonus = Math.min(loserActionBonus, cap);
    const cap = roomPreset.bonusCap ?? 8; // اگر مقدار null بود، پیش‌فرض 8
    const cappedWinnerActionBonus = Math.min(winnerActionBonus, cap);
    const cappedLoserActionBonus = Math.min(loserActionBonus, cap);

    // ۷. محاسبه XP کل برای هر بازیکن
    const winnerTotalXP = winnerBaseXP + winTypeBonus + cappedWinnerActionBonus;
    const loserTotalXP = loserBaseXP + cappedLoserActionBonus;

    // ۸. به‌روزرسانی UserStats برای برنده
    await updateUserXP(winnerId, winnerTotalXP, gameId);
    await updateUserXP(loserId, loserTotalXP, gameId);

    // ۹. ذخیره در XPHistory برای برنده
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

    // 1۰. ذخیره در XPHistory برای بازنده
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

  // محدودیت‌های هر نوع پاداش
  let hitCount = 0;
  let blockCount = 0;
  let hitAfterExitCount = 0;
  let cubeWinBonus = 0;

  for (const event of events) {
    if (event.type === "MOVE_APPLIED") {
      const payload = event.payload as any;

      // 1. زدن مهره حریف (hit_opponent)
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

      // 3. زدن مهره بعد از شروع خروج (hit_after_exit) - ساده‌سازی: اگر hit در خانه‌های انتهایی باشد
      // در عمل باید بررسی شود که آیا حریف شروع به خروج کرده یا نه
      // برای ساده‌سازی فعلاً این بخش را در نظر نمی‌گیریم
    }

    if (event.type === "TURN_PASSED") {
      // 2. جلوگیری از تاس ریختن حریف (block_entry)
      // نیاز به بررسی board دارد که آیا خانه‌های ورودی حریف بسته شده یا نه
      // برای ساده‌سازی فعلاً این بخش را در نظر نمی‌گیریم
    }

    if (event.type === "CUBE_ACCEPTED") {
      // ۶. پاداش تاس داو (قبول شد و برنده شدی)
      // فقط یک بار
      if (cubeWinBonus === 0) {
        // باید بررسی شود که آیا این بازیکن برنده شده است یا نه
        // فعلاً به برنده داده می‌شود
        winnerBonus += 2;
        cubeWinBonus = 1;
      }
    }
  }

  return { winner: winnerBonus, loser: loserBonus };
}

/**
 * دریافت Cap بر اساس اتاق (مطابق مستندات)
 * - Room1: 4
 * - Room2: 6
 * - Room3 به بالا: 8
 */
function getCapByRoom(roomType: RoomType): number {
  switch (roomType) {
    case RoomType.ROOM1:
      return 4;
    case RoomType.ROOM2:
      return 6;
    default:
      return 8; // ROOM3 تا ROOM9
  }
}

/**
 * به‌روزرسانی XP و Level کاربر
 */
async function updateUserXP(userId: number, xpGained: number, gameId: number) {
  const userStats = await prisma.userStats.findUnique({
    where: { userId },
  });

  if (!userStats) {
    console.error(`[Progression] UserStats not found for user ${userId}`);
    return;
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

  // For coin and gem, we don't track delta yet, so we just send current values.
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
