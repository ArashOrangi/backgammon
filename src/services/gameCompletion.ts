// services/gameCompletion.ts
import { prisma } from "@/components/prisma";
import { calculateAndApplyXP } from "./progression";
import { calculateLBPoints } from "./leaderboard";
import { handleEconomy } from "./economy";
import { GameState } from "@/game/types";
import { MatchResultType } from "@prisma/client";

/**
 * نگاشت winType به MatchResultType
 */
function mapWinTypeToMatchResult(winType: string): MatchResultType {
  switch (winType) {
    case "mars":
      return MatchResultType.gammon;
    case "backgammon":
      return MatchResultType.backgammon;
    case "normal":
    default:
      return MatchResultType.normal;
  }
}

/**
 * پردازش کامل پایان بازی
 * این تابع بعد از رویداد GAME_FINISHED فراخوانی می‌شود
 */
export async function processGameCompletion(gameId: number, state: GameState) {
  try {
    console.log(`[GameCompletion] Processing game ${gameId}...`);

    // 1. پردازش XP و Level (Progression)
    await calculateAndApplyXP(gameId, state);

    // 2. پردازش امتیاز لیدربورد (Leaderboard)
    await calculateLBPoints(gameId, state);

    // 3. پردازش تراکنش‌های اقتصادی (Economy)
    await handleEconomy(gameId, state);

    // ===== 4. به‌روزرسانی MatchRecord و MatchParticipent =====
    await updateMatchRecord(gameId, state);

    console.log(`[GameCompletion] Game ${gameId} completed successfully`);
  } catch (error) {
    console.error(`[GameCompletion] Error processing game ${gameId}:`, error);
    // خطا را لاگ می‌کنیم اما اجرای بازی را تحت تأثیر قرار نمی‌دهیم
  }
}

/**
 * به‌روزرسانی رکورد مسابقه (MatchRecord) و شرکت‌کنندگان پس از پایان بازی
 */
async function updateMatchRecord(gameId: number, state: GameState) {
  // 1. پیدا کردن MatchRecord مرتبط با این بازی
  const matchRecord = await prisma.matchRecord.findFirst({
    where: { gameId },
    include: { participants: true },
  });

  if (!matchRecord) {
    console.warn(
      `[GameCompletion] No MatchRecord found for game ${gameId}, skipping update`,
    );
    return;
  }

  // 2. محاسبه مدت زمان بازی (به دقیقه)
  const startTime = matchRecord.startMatch.getTime();
  const endTime = Date.now();
  const matchLength = Math.floor((endTime - startTime) / 60000); // دقیقه

  // 3. دریافت رکورد تاس‌ها از GameState (در صورت موجود بودن)
  const diceRecord = state.dice ? state.dice.join(",") : null;

  // 4. به‌روزرسانی MatchRecord
  await prisma.matchRecord.update({
    where: { id: matchRecord.id },
    data: {
      endMatch: new Date(),
      matchLength,
      diceRecord: diceRecord ? parseInt(diceRecord.replace(",", "")) : null,
    },
  });

  // 5. به‌روزرسانی شرکت‌کنندگان (نتیجه و ضربات)
  const winnerId = state.winner;
  if (!winnerId) {
    console.warn(`[GameCompletion] No winner found for game ${gameId}`);
    return;
  }

  // دریافت اطلاعات ضربات از رویدادها (اختیاری)
  const events = await prisma.gameEvents.findMany({
    where: {
      gameId,
      isUndo: false,
      type: "MOVE_APPLIED",
    },
  });

  // محاسبه تعداد ضربات برای هر بازیکن
  const hitCounts: Record<number, number> = {};
  for (const event of events) {
    const payload = event.payload as any;
    if (payload.hitOpponentId) {
      const hitterId = payload.playerId;
      hitCounts[hitterId] = (hitCounts[hitterId] || 0) + 1;
    }
  }

  // نگاشت winType به MatchResultType برای برنده
  const winnerResultType = mapWinTypeToMatchResult(state.winType || "normal");

  // به‌روزرسانی هر شرکت‌کننده
  for (const participant of matchRecord.participants) {
    const isWinner = participant.playerId === winnerId;
    const hits = hitCounts[participant.playerId] || 0;

    await prisma.matchParticipent.update({
      where: { id: participant.id },
      data: {
        result: isWinner,
        hits,
        resultType: isWinner ? winnerResultType : MatchResultType.loss,
      },
    });
  }

  console.log(
    `[GameCompletion] MatchRecord ${matchRecord.id} updated for game ${gameId}`,
  );
}
