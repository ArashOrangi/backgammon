import { calculateAndApplyXP } from "./progression";
import { calculateLBPoints } from "./leaderboard";
import { handleEconomy } from "./economy";
import { GameState } from "@/game/types";

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

    console.log(`[GameCompletion] Game ${gameId} completed successfully`);
  } catch (error) {
    console.error(`[GameCompletion] Error processing game ${gameId}:`, error);
    // خطا را لاگ می‌کنیم اما اجرای بازی را تحت تأثیر قرار نمی‌دهیم
  }
}
