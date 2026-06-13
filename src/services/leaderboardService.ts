import { RoomType } from "@prisma/client";
import {
  createMatchLBRecord,
  getPreviousMatchesCount,
} from "@/models/leaderboard";
import { getBasePoints, getWinTypeBonus } from "@/game/leaderboardConfig"; // مطابق فایل قبلی

const BOT_USER_ID = 1;

/**
 * محاسبه repetition multiplier بر اساس تعداد بازی‌های قبلی در ۳۰ دقیقه
 */
async function getRepetitionMultiplier(
  userId: number,
  opponentId: number,
  currentGameTime: Date,
): Promise<number> {
  const prevCount = await getPreviousMatchesCount(
    userId,
    opponentId,
    currentGameTime,
  );
  const matchNumber = prevCount + 1;
  if (matchNumber >= 4) return 0;
  if (matchNumber === 3) return 0.5;
  return 1;
}

/**
 * تابع اصلی: ثبت امتیاز لیدربورد برای یک بازی تمام شده
 */
export async function updateLeaderboardAfterGame(
  gameId: number,
  winnerId: number,
  loserId: number,
  roomType: RoomType,
  winType: string, // "normal" | "mars" | "backgammon"
  gameCreatedAt: Date,
) {
  // حذف بازی‌های با بات
  if (winnerId === BOT_USER_ID || loserId === BOT_USER_ID) return;

  // ---- برنده ----
  const multiplierWinner = await getRepetitionMultiplier(
    winnerId,
    loserId,
    gameCreatedAt,
  );
  const baseWinner = getBasePoints(roomType, true);
  const bonusWinner = getWinTypeBonus(winType);
  const totalWinner = Math.floor((baseWinner + bonusWinner) * multiplierWinner);

  await createMatchLBRecord({
    userId: winnerId,
    opponentId: loserId,
    gameId,
    roomType,
    isWin: true,
    winType,
    repetitionMultiplier: multiplierWinner,
    basePoints: baseWinner,
    bonusPoints: bonusWinner,
    totalLBPoints: totalWinner,
    createdAt: gameCreatedAt,
  });

  // ---- بازنده ----
  const multiplierLoser = await getRepetitionMultiplier(
    loserId,
    winnerId,
    gameCreatedAt,
  );
  const baseLoser = getBasePoints(roomType, false);
  const totalLoser = Math.floor(baseLoser * multiplierLoser);

  await createMatchLBRecord({
    userId: loserId,
    opponentId: winnerId,
    gameId,
    roomType,
    isWin: false,
    winType: undefined,
    repetitionMultiplier: multiplierLoser,
    basePoints: baseLoser,
    bonusPoints: 0,
    totalLBPoints: totalLoser,
    createdAt: gameCreatedAt,
  });
}
