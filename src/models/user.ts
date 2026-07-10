// models/user.ts
import { errorHandlersOnPrisma } from "@/components/errorHandler";
import { prisma } from "@/components/prisma";
import { Prisma } from "@prisma/client";
import { JsonValue } from "@prisma/client/runtime/client";
import { applyStarterPackToUser } from "@/services/starter-pack.service";
import { generateFakeUserData } from "@/services/fake-data.service";

export interface User {
  id: number;
  userName: string;
  phoneNumber?: string | null;
  lastOnline: Date;
  isLocked: boolean;
  winRate: number;
  mmr: number;
  winStreak: number;
  lossStreak: number;
  recentResults: JsonValue;
  recentOpponents: JsonValue;
  createdAt: Date;
  updatedAt: Date;
  gender?: "MAN" | "WOMAN" | "OTHER";
  level?: number | null;
  password?: string | null; // 👈 فقط برای استفاده داخلی (مثلاً احراز هویت)
  provinceId?: number | null;
  cityId?: number | null;
  avatar?: string | null;
  frame?: string | null;
  title?: string | null;
  selectedDiceId?: number | null;
  selectedCheckerId?: number | null;
  selectedCupId?: number | null;
  selectedBoardId?: number | null;
  selectedStickerId?: number | null;
  totalWins: number;
  totalMars: number;
  totalBackgammon: number;
  totalMatches: number;
}

// ✅ Select عمومی برای پاسخ‌های کلاینت (بدون password)
const prismaSelectUserPublic = {
  id: true,
  userName: true,
  winRate: true,
  mmr: true,
  winStreak: true,
  lossStreak: true,
  recentResults: true,
  recentOpponents: true,
  createdAt: true,
  updatedAt: true,
  phoneNumber: true,
  gender: true,
  level: true,
  // password: true  // ❌ حذف شده
  isLocked: true,
  lastOnline: true,
  provinceId: true,
  cityId: true,
  avatar: true,
  frame: true,
  title: true,
  selectedDiceId: true,
  selectedCheckerId: true,
  selectedCupId: true,
  selectedBoardId: true,
  selectedStickerId: true,
  totalWins: true,
  totalMars: true,
  totalBackgammon: true,
  totalMatches: true,
} as const;

//  Select مخصوص احراز هویت (شامل password)
const prismaSelectUserAuth = {
  ...prismaSelectUserPublic,
  password: true,
} as const;

// ------------------- توابع اصلی گیم‌پلی -------------------

export async function prismaUserGetOrCreate(userName: string) {
  try {
    const existingUser = await prisma.user.findUnique({
      where: { userName },
      select: prismaSelectUserPublic,
    });
    if (existingUser) return existingUser;

    const newUser = await prisma.user.create({
      data: { userName },
      select: prismaSelectUserPublic,
    });

    // اعمال Starter Pack و دیتای فیک (به جز برای بات)
    if (newUser && userName !== "SystemBot") {
      try {
        const packId = "starter_classic";
        await applyStarterPackToUser(newUser.id, packId);
      } catch (error) {
        console.error(
          `Failed to apply starter pack to user ${newUser.id}:`,
          error,
        );
      }
      try {
        await generateFakeUserData(newUser.id);
      } catch (error) {
        console.error(
          `Failed to generate fake data for user ${newUser.id}:`,
          error,
        );
      }
    }

    return newUser;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function prismaUserGetById(id: number) {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: prismaSelectUserPublic,
    });
    return user;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

// ✅ این تابع برای احراز هویت استفاده می‌شود و شامل password است
export async function prismaUserGetByUsername(userName: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { userName },
      select: prismaSelectUserAuth,
    });
    return user;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function prismaUserUpdateWinRate({
  userId,
  winRate,
}: {
  userId: number;
  winRate: number;
}) {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { winRate },
      select: prismaSelectUserPublic,
    });
    return user;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function generateGuestUsername(): Promise<string> {
  const guests = await prisma.user.findMany({
    where: { userName: { startsWith: "guest_" } },
    select: { userName: true },
  });
  const numbers = guests
    .map((g) => {
      const match = g.userName.match(/guest_(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));
  const nextNumber = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `guest_${nextNumber}`;
}

// ------------------- توابع پروفایل -------------------

export async function createUserWithProfile(data: {
  userName?: string;
  provinceId?: number;
  cityId?: number;
  phoneNumber?: string;
  gender?: "MAN" | "WOMAN" | "OTHER";
  avatar?: string;
  frame?: string;
  title?: string;
}) {
  const {
    userName,
    provinceId,
    cityId,
    phoneNumber,
    gender,
    avatar,
    frame,
    title,
  } = data;

  const finalUsername = userName || (await generateGuestUsername());

  try {
    const user = await prisma.user.create({
      data: {
        userName: finalUsername,
        gender: gender || "MAN",
        provinceId: provinceId || null,
        cityId: cityId || null,
        phoneNumber: phoneNumber || null,
        avatar: avatar || null,
        frame: frame || null,
        title: title || null,
      },
      select: prismaSelectUserPublic,
    });

    if (user) {
      try {
        const packId = userName ? "starter_classic" : undefined;
        await applyStarterPackToUser(user.id, packId);
      } catch (error) {
        console.error(
          `Failed to apply starter pack to user ${user.id}:`,
          error,
        );
      }
      try {
        await generateFakeUserData(user.id);
      } catch (error) {
        console.error(
          `Failed to generate fake data for user ${user.id}:`,
          error,
        );
      }
    }

    return user;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function updateUserProfile(
  userId: number,
  data: Partial<{
    provinceId: number;
    cityId: number;
    phoneNumber: string;
    gender: "MAN" | "WOMAN" | "OTHER";
    level: number;
    password: string;
    avatar: string;
    frame: string;
    title: string;
    selectedDiceId: number;
    selectedCheckerId: number;
    selectedCupId: number;
    selectedBoardId: number;
    selectedStickerId: number;
  }>,
) {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: data as Prisma.UserUpdateInput,
      select: prismaSelectUserPublic,
    });
    return user;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

/**
 * دریافت پروفایل کاربر با اطلاعات اضافی از جمله سطح، سکه، XP و بازی‌های مشترک
 * @param userId شناسه کاربر مورد نظر
 * @param currentUserId شناسه کاربر درخواست‌کننده (اختیاری) – برای محاسبه بازی‌های مشترک
 */
export async function getUserWithProfile(
  userId: number,
  currentUserId?: number,
) {
  try {
    // ۱. دریافت اطلاعات پایه کاربر (بدون password)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: prismaSelectUserPublic,
    });
    if (!user) return null;

    // ۲. دریافت اطلاعات آماری (UserStats)
    const userStats = await prisma.userStats.findUnique({
      where: { userId },
    });

    // ۳. محاسبه بازی‌های مشترک (در صورت وجود currentUserId)
    let commonMatches = 0;
    let lastMatchDate: Date | null = null;
    let lastMatchResult: string | null = null;

    if (currentUserId && currentUserId !== userId) {
      const commonGames = await prisma.matchParticipent.findMany({
        where: {
          playerId: userId,
          matchRecord: {
            participants: {
              some: { playerId: currentUserId },
            },
          },
        },
      });

      commonMatches = commonGames.length;

      if (commonMatches > 0) {
        const lastGame = await prisma.matchParticipent.findFirst({
          where: {
            playerId: userId,
            matchRecord: {
              participants: {
                some: { playerId: currentUserId },
              },
            },
          },
          orderBy: { matchRecord: { endMatch: "desc" } },
          include: {
            matchRecord: {
              include: {
                participants: true,
              },
            },
          },
        });

        if (lastGame) {
          lastMatchDate = lastGame.matchRecord.endMatch;
          const currentUserParticipent = lastGame.matchRecord.participants.find(
            (p) => p.playerId === currentUserId,
          );
          if (currentUserParticipent) {
            lastMatchResult = currentUserParticipent.result ? "win" : "loss";
          }
        }
      }
    }

    // ۴. ترکیب اطلاعات و بازگرداندن
    return {
      ...user,
      // سطح، XP، سکه و الماس از UserStats گرفته می‌شوند
      level: userStats?.level ?? 1,
      xp: userStats?.xp ?? 0,
      coin: userStats?.coin ?? 0,
      gem: userStats?.gem ?? 0,
      // اطلاعات بازی‌های مشترک
      commonMatches,
      lastMatchDate,
      lastMatchResult,
    };
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

// ------------------- توابع کمکی برای آمار -------------------

export async function updateUserStats(
  userId: number,
  data: Partial<{
    mmr: number;
    winStreak: number;
    lossStreak: number;
    recentResults: JsonValue;
    recentOpponents: JsonValue;
    totalWins: number;
    totalMars: number;
    totalBackgammon: number;
    totalMatches: number;
  }>,
) {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: data as Prisma.UserUpdateInput,
      select: prismaSelectUserPublic,
    });
    return user;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

// ------------------- توابع کمکی برای آمار بازی (پس از هر مسابقه) -------------------

export async function incrementUserStats({
  userId,
  isWin,
  isMars = false,
  isBackgammon = false,
}: {
  userId: number;
  isWin: boolean;
  isMars?: boolean;
  isBackgammon?: boolean;
}) {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        totalMatches: { increment: 1 },
        totalWins: isWin ? { increment: 1 } : undefined,
        totalMars: isMars ? { increment: 1 } : undefined,
        totalBackgammon: isBackgammon ? { increment: 1 } : undefined,
      },
      select: prismaSelectUserPublic,
    });
    return user;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}
