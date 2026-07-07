import { prisma } from "@/components/prisma";
import { GameState } from "@/game/types";

/**
 * مدیریت تراکنش‌های اقتصادی پس از پایان بازی
 */
export async function handleEconomy(gameId: number, state: GameState) {
  try {
    // 1. دریافت اطلاعات بازی و اتاق
    const game = await prisma.games.findUnique({
      where: { id: gameId },
      include: { matchRecords: { include: { roomPreset: true } } },
    });

    if (!game) {
      console.error(`[Economy] Game ${gameId} not found`);
      return;
    }

    const roomPreset = game.matchRecords[0]?.roomPreset;
    if (!roomPreset) {
      console.error(`[Economy] Room preset not found for game ${gameId}`);
      return;
    }

    const buyIn = roomPreset.coinBuyIn ?? 0;
    const reward = roomPreset.coinReward ?? 0;

    // اگر Buy-in و Reward هر دو صفر باشند، نیازی به پردازش نیست
    if (buyIn === 0 && reward === 0) {
      console.log(`[Economy] No economy transaction for game ${gameId}`);
      return;
    }

    // 2. تشخیص برنده و بازنده
    const winnerId = state.winner;
    if (!winnerId) {
      console.error(`[Economy] No winner found for game ${gameId}`);
      return;
    }

    const loserId = state.players.find((p) => p.id !== winnerId)?.id;
    if (!loserId) {
      console.error(`[Economy] Loser not found for game ${gameId}`);
      return;
    }

    // 3. کسر Buy-in از هر دو بازیکن
    if (buyIn > 0) {
      await deductCoin(loserId, buyIn, gameId, "buy_in");
      await deductCoin(winnerId, buyIn, gameId, "buy_in");
    }

    // ۴. اضافه کردن Reward به برنده
    if (reward > 0) {
      await addCoin(winnerId, reward, gameId, "reward");
    }

    console.log(
      `[Economy] Game ${gameId} processed: Winner ${winnerId} +${reward} coin, Loser ${loserId} -${buyIn} coin`,
    );
  } catch (error) {
    console.error("[Economy] Error:", error);
  }
}

/**
 * کسر سکه از کاربر
 */
async function deductCoin(
  userId: number,
  amount: number,
  gameId: number,
  reason: string,
) {
  if (amount <= 0) return;

  const userStats = await prisma.userStats.findUnique({
    where: { userId },
  });

  if (!userStats) {
    console.error(`[Economy] UserStats not found for user ${userId}`);
    return;
  }

  const currentCoin = userStats.coin || 0;
  const newCoin = Math.max(0, currentCoin - amount);

  await prisma.userStats.update({
    where: { userId },
    data: { coin: newCoin },
  });

  // ثبت تاریخچه
  await prisma.userCoinHistory.create({
    data: {
      clientId: userId,
      amount: -amount,
      date: new Date(),
      // initiatorId می‌تواند gameId باشد یا null
    },
  });
}

/**
 * اضافه کردن سکه به کاربر
 */
async function addCoin(
  userId: number,
  amount: number,
  gameId: number,
  reason: string,
) {
  if (amount <= 0) return;

  const userStats = await prisma.userStats.findUnique({
    where: { userId },
  });

  if (!userStats) {
    console.error(`[Economy] UserStats not found for user ${userId}`);
    return;
  }

  const currentCoin = userStats.coin || 0;
  const newCoin = currentCoin + amount;

  await prisma.userStats.update({
    where: { userId },
    data: { coin: newCoin },
  });

  // ثبت تاریخچه
  await prisma.userCoinHistory.create({
    data: {
      clientId: userId,
      amount: amount,
      date: new Date(),
      // initiatorId می‌تواند gameId باشد یا null
    },
  });
}
