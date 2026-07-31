import { prisma } from "@/components/prisma";
import { SpinPrizeType } from "@prisma/client";

interface Prize {
  id: number; // 0-9
  label: string; // "سکه 25", "جکپات"
  value: number; // مقدار جایزه
  probability: number; // 0.08, 0.15, ...
  type: SpinPrizeType;
}

interface SpinResult {
  prize: Prize;
  wonCoin: number;
  newBalance: number;
  spinCount: number; // تعداد چرخش امروز
}

export class SpinService {
  private config: Prize[] = [
    { id: 0, label: "سکه ۲۵", value: 25, probability: 0.08, type: "COIN" },
    { id: 1, label: "سکه ۵۰", value: 50, probability: 0.15, type: "COIN" },
    { id: 2, label: "سکه ۷۵", value: 75, probability: 0.2, type: "COIN" },
    { id: 3, label: "سکه ۱۰۰", value: 100, probability: 0.19, type: "COIN" },
    { id: 4, label: "سکه ۱۲۵", value: 125, probability: 0.15, type: "COIN" },
    { id: 5, label: "سکه ۱۵۰", value: 150, probability: 0.09, type: "COIN" },
    { id: 6, label: "سکه ۱۷۵", value: 175, probability: 0.05, type: "COIN" },
    { id: 7, label: "سکه ۲۰۰", value: 200, probability: 0.04, type: "COIN" },
    { id: 8, label: "سکه ۲۵۰", value: 250, probability: 0.01, type: "COIN" },
    { id: 9, label: "جکپات", value: 500, probability: 0.01, type: "JACKPOT" },
  ];

  private readonly COST = 100;
  private readonly DAILY_LIMIT = 5;

  /**
   * دریافت پیکربندی گردونه (برای نمایش در UI)
   */
  getConfig() {
    return {
      cost: this.COST,
      dailyLimit: this.DAILY_LIMIT,
      prizes: this.config.map(({ id, label, value, probability, type }) => ({
        id,
        label,
        value,
        probability: Math.round(probability * 100), // درصد
        type,
      })),
    };
  }

  /**
   * انجام چرخش
   */
  async spin(userId: number): Promise<SpinResult> {
    // ۱. بررسی موجودی سکه
    const stats = await prisma.userStats.findUnique({ where: { userId } });
    if (!stats) throw new Error("User stats not found");
    if ((stats.coin || 0) < this.COST) {
      throw new Error("Insufficient coins for spin");
    }

    // ۲. بررسی محدودیت روزانه
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaySpins = await prisma.spinHistory.count({
      where: {
        userId,
        spinAt: { gte: today },
      },
    });
    if (todaySpins >= this.DAILY_LIMIT) {
      throw new Error("Daily spin limit reached");
    }

    // ۳. انتخاب جایزه بر اساس احتمال (Weighted Random)
    const prize = this.selectPrize();

    // ۴. کسر هزینه و اضافه کردن جایزه
    const newCoin = (stats.coin || 0) - this.COST + prize.value;
    await prisma.userStats.update({
      where: { userId },
      data: { coin: newCoin },
    });

    // ۵. ثبت تاریخچه
    await prisma.spinHistory.create({
      data: {
        userId,
        prizeIndex: prize.id,
        prizeValue: prize.value,
        prizeType: prize.type,
        spinCost: this.COST,
      },
    });

    return {
      prize,
      wonCoin: prize.value,
      newBalance: newCoin,
      spinCount: todaySpins + 1,
    };
  }

  /**
   * انتخاب تصادفی بر اساس وزن احتمال (Cumulative Distribution)
   */
  private selectPrize(): Prize {
    const rand = Math.random();
    let cumulative = 0;
    for (const prize of this.config) {
      cumulative += prize.probability;
      if (rand <= cumulative) {
        return prize;
      }
    }
    return this.config[this.config.length - 1]; // fallback
  }

  /**
   * دریافت تاریخچه چرخش‌های کاربر (اخیر)
   */
  async getHistory(userId: number, limit: number = 20) {
    return prisma.spinHistory.findMany({
      where: { userId },
      orderBy: { spinAt: "desc" },
      take: limit,
    });
  }

  /**
   * دریافت آمار چرخش‌های امروز کاربر
   */
  async getTodayStats(userId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const count = await prisma.spinHistory.count({
      where: {
        userId,
        spinAt: { gte: today },
      },
    });
    return {
      used: count,
      limit: this.DAILY_LIMIT,
      remaining: Math.max(0, this.DAILY_LIMIT - count),
    };
  }
}
