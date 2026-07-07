import { prisma } from "@/components/prisma";
import { RoomType, MatchResultType } from "@prisma/client";

/**
 * تولید دیتای فیک برای کاربر جدید
 * @param userId شناسه کاربر
 */
export async function generateFakeUserData(userId: number) {
  console.log(`🎲 Generating fake data for user ${userId}...`);

  // ۱. تولید آمار بازی
  const totalMatches = getRandomInt(10, 50);
  const totalWins = getRandomInt(3, totalMatches);
  const totalMars = getRandomInt(0, Math.floor(totalWins / 3));
  const totalBackgammon = getRandomInt(0, Math.floor(totalWins / 5));
  const winRate = totalMatches > 0 ? (totalWins / totalMatches) * 100 : 0;
  const winStreak = getRandomInt(0, 5);
  const lossStreak = getRandomInt(0, 4);
  const mmr = getRandomInt(800, 1600);

  // ۲. به‌روزرسانی User
  await prisma.user.update({
    where: { id: userId },
    data: {
      totalMatches,
      totalWins,
      totalMars,
      totalBackgammon,
      winRate,
      winStreak,
      lossStreak,
      mmr,
      recentResults: generateRecentResults(totalMatches),
      recentOpponents: generateRecentOpponents(),
    },
  });

  // ۳. ایجاد رکوردهای فیک لیدربورد
  await generateFakeLeaderboardRecords(userId);

  // ۴. ایجاد رکوردهای فیک مسابقه
  await generateFakeMatchRecords(userId);

  // ۵. ایجاد رکوردهای فیک تورنومنت
  await generateFakeTournamentRecords(userId);

  console.log(`✅ Fake data generated for user ${userId}`);
}

function generateRecentResults(totalMatches: number): boolean[] {
  const results: boolean[] = [];
  for (let i = 0; i < Math.min(totalMatches, 20); i++) {
    results.push(Math.random() > 0.4);
  }
  return results;
}

function generateRecentOpponents(): Array<{
  opponentId: number;
  timestamp: number;
}> {
  const opponents = [];
  const count = getRandomInt(3, 10);
  for (let i = 0; i < count; i++) {
    opponents.push({
      opponentId: getRandomInt(10, 200),
      timestamp: Date.now() - getRandomInt(0, 30 * 24 * 60 * 60 * 1000),
    });
  }
  return opponents;
}

/**
 * ایجاد یک کاربر فیک برای استفاده به‌عنوان حریف
 */
async function createFakeUser(): Promise<number> {
  const guest = await prisma.user.create({
    data: { userName: `fake_opponent_${Date.now()}_${getRandomInt(100, 999)}` },
  });
  return guest.id;
}

/**
 * ایجاد یک بازی فیک بین دو کاربر (با شناسه‌های معتبر)
 */
async function createFakeGame(
  userId1: number,
  userId2: number,
): Promise<number> {
  const game = await prisma.games.create({
    data: {
      whitePlayerId: userId1,
      blackPlayerId: userId2,
      status: "FINISHED",
    },
  });
  return game.id;
}

async function generateFakeLeaderboardRecords(userId: number) {
  const roomTypes = [
    RoomType.CASUAL_1,
    RoomType.CASUAL_2,
    RoomType.COMPETITIVE_1,
    RoomType.COMPETITIVE_2,
  ];
  const winTypes = ["normal", "mars", "backgammon"];
  // افزایش تعداد رکوردها
  const count = getRandomInt(15, 30); // قبلاً ۵-۱۵ بود

  // یک حریف و یک بازی ایجاد می‌کنیم
  const opponentId = await createFakeUser();
  const gameId = await createFakeGame(userId, opponentId);

  for (let i = 0; i < count; i++) {
    const roomType = roomTypes[Math.floor(Math.random() * roomTypes.length)];
    const isWin = Math.random() > 0.4;
    const winType = isWin
      ? winTypes[Math.floor(Math.random() * winTypes.length)]
      : null;
    const basePoints = getRandomInt(5, 30);
    const bonusPoints = isWin ? getRandomInt(0, 10) : 0;
    const repetitionMultiplier =
      [1, 1, 0.5, 0][Math.floor(Math.random() * 4)] || 1;
    const totalLBPoints = Math.floor(
      (basePoints + bonusPoints) * repetitionMultiplier,
    );

    // تاریخ‌های پراکنده در ۳۰ روز گذشته
    const daysAgo = getRandomInt(0, 30);
    const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

    try {
      await prisma.matchLBRecord.create({
        data: {
          userId,
          opponentId,
          gameId,
          roomType,
          isWin,
          winType,
          repetitionMultiplier,
          basePoints,
          bonusPoints,
          totalLBPoints,
          createdAt,
        },
      });
    } catch (error) {
      console.warn(`   ⚠️ Failed to create LB record: ${error}`);
    }
  }
}

async function generateFakeMatchRecords(userId: number) {
  const roomTypes = [
    RoomType.CASUAL_1,
    RoomType.CASUAL_2,
    RoomType.COMPETITIVE_1,
    RoomType.COMPETITIVE_2,
  ];
  const resultTypes = [
    MatchResultType.normal,
    MatchResultType.gammon,
    MatchResultType.backgammon,
    MatchResultType.timer,
  ];
  const count = getRandomInt(3, 10);

  for (let i = 0; i < count; i++) {
    const opponentId = await createFakeUser(); // ایجاد حریف جدید برای هر مسابقه
    const isWin = Math.random() > 0.4;
    const resultType = isWin
      ? resultTypes[Math.floor(Math.random() * resultTypes.length)]
      : MatchResultType.normal;
    const daysAgo = getRandomInt(0, 30);
    const startMatch = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    const endMatch = new Date(
      startMatch.getTime() + getRandomInt(5, 30) * 60 * 1000,
    );
    const roomType = roomTypes[Math.floor(Math.random() * roomTypes.length)];

    try {
      // ایجاد MatchRecord (بدون نیاز به gameId)
      const match = await prisma.matchRecord.create({
        data: {
          roomPresetId: getRoomPresetId(roomType),
          diceRecord: getRandomInt(1, 6),
          startMatch,
          endMatch,
          matchLength: Math.floor(
            (endMatch.getTime() - startMatch.getTime()) / 60000,
          ),
        },
      });

      // ایجاد MatchParticipent برای کاربر
      await prisma.matchParticipent.create({
        data: {
          matchRecordId: match.id,
          playerId: userId,
          side: Math.random() > 0.5,
          result: isWin,
          resultType,
          hits: getRandomInt(0, 5),
          minichatUsed: Math.random() > 0.7,
          stickersUsed: Math.random() > 0.7,
          doublingCubeUseCount: getRandomInt(0, 3),
        },
      });

      // ایجاد MatchParticipent برای حریف
      await prisma.matchParticipent.create({
        data: {
          matchRecordId: match.id,
          playerId: opponentId,
          side: !(Math.random() > 0.5),
          result: !isWin,
          resultType: !isWin
            ? resultTypes[Math.floor(Math.random() * resultTypes.length)]
            : MatchResultType.normal,
          hits: getRandomInt(0, 5),
          minichatUsed: false,
          stickersUsed: false,
          doublingCubeUseCount: getRandomInt(0, 2),
        },
      });
    } catch (error) {
      console.warn(`   ⚠️ Failed to create match record: ${error}`);
    }
  }
}

async function generateFakeTournamentRecords(userId: number) {
  const tournamentCount = getRandomInt(1, 5);

  for (let i = 0; i < tournamentCount; i++) {
    try {
      const tournament = await prisma.tournamentPreset.create({
        data: {
          tournamentType: Buffer.from(`tournament_${i}`),
          groupCount: getRandomInt(2, 8),
          gamePerGroup: getRandomInt(1, 3),
        },
      });

      const startMatch = new Date(
        Date.now() - getRandomInt(0, 30) * 24 * 60 * 60 * 1000,
      );
      const match = await prisma.matchRecord.create({
        data: {
          roomPresetId: getRoomPresetId(RoomType.COMPETITIVE_1),
          diceRecord: getRandomInt(1, 6),
          startMatch,
          endMatch: new Date(
            startMatch.getTime() + getRandomInt(10, 45) * 60 * 1000,
          ),
          matchLength: getRandomInt(10, 45),
        },
      });

      const participent = await prisma.matchParticipent.create({
        data: {
          matchRecordId: match.id,
          playerId: userId,
          side: Math.random() > 0.5,
          result: Math.random() > 0.4,
          resultType: MatchResultType.normal,
          hits: getRandomInt(0, 5),
          minichatUsed: false,
          stickersUsed: false,
          doublingCubeUseCount: 0,
        },
      });

      await prisma.tournamentParticipentRecord.create({
        data: {
          tournamentMatchParticipemntId: participent.id,
          tournamentPresetId: tournament.id,
        },
      });
    } catch (error) {
      console.warn(`   ⚠️ Failed to create tournament record: ${error}`);
    }
  }
}

// ===== توابع کمکی =====

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRoomPresetId(roomType: RoomType): number | null {
  const mapping: Record<RoomType, number> = {
    [RoomType.CASUAL_1]: 1,
    [RoomType.CASUAL_2]: 2,
    [RoomType.COMPETITIVE_1]: 3,
    [RoomType.COMPETITIVE_2]: 4,
  };
  return mapping[roomType] || null;
}
