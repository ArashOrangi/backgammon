// models/user.ts
import { errorHandlersOnPrisma } from "@/components/errorHandler";
import { prisma } from "@/components/prisma";
import { Prisma } from "@prisma/client";
import { JsonValue } from "@prisma/client/runtime/client";
// ===== اضافه شده: import سرویس‌های Starter Pack و Fake Data =====
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
  password?: string | null;
  provinceId?: number | null;
  cityId?: number | null;
  // ===== فیلدهای پروفایل جدید =====
  avatar?: string | null;
  frame?: string | null;
  title?: string | null;
  // ===== فیلدهای شخصی‌سازی =====
  selectedDiceId?: number | null;
  selectedCheckerId?: number | null;
  selectedCupId?: number | null;
  selectedBoardId?: number | null;
  selectedStickerId?: number | null;
  // ===== آمار بازی =====
  totalWins: number;
  totalMars: number;
  totalBackgammon: number;
  totalMatches: number;
}

const prismaSelectUser = {
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
  password: true,
  isLocked: true,
  lastOnline: true,
  provinceId: true,
  cityId: true,
  // ===== فیلدهای جدید =====
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

// ------------------- توابع اصلی گیم‌پلی -------------------

export async function prismaUserGetOrCreate(userName: string) {
  try {
    const existingUser = await prisma.user.findUnique({
      where: { userName },
      select: prismaSelectUser,
    });
    if (existingUser) return existingUser;

    const newUser = await prisma.user.create({
      data: { userName },
      select: prismaSelectUser,
    });

    // ===== اضافه شده: اعمال Starter Pack و دیتای فیک (به جز برای بات) =====
    if (newUser && userName !== "SystemBot") {
      try {
        const packId = "starter_classic"; // یا undefined برای رندوم
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
    // ================================================================

    return newUser;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function prismaUserGetById(id: number) {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      select: prismaSelectUser,
    });
    return user;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function prismaUserGetByUsername(userName: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { userName },
      select: prismaSelectUser,
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
      select: prismaSelectUser,
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
  console.log("donaballl", { userName, finalUsername });
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
      select: prismaSelectUser,
    });

    // ===== اضافه شده: اعمال Starter Pack و دیتای فیک به کاربر جدید =====
    if (user) {
      // ۱. اعمال بسته شروع (Starter Pack)
      console.log("fake data");

      try {
        const packId = userName ? "starter_classic" : undefined;
        await applyStarterPackToUser(user.id, packId);
        console.log("LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL");
      } catch (error) {
        console.log("QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ");

        console.error(
          `Failed to apply starter pack to user ${user.id}:`,
          error,
        );
      }

      // ۲. تولید دیتای فیک (آمار، تورنومنت، لیدربورد)
      try {
        console.log("generateFakeUserData33333333333333333333");

        await generateFakeUserData(user.id);
      } catch (error) {
        console.error(
          `Failed to generate fake data for user ${user.id}:`,
          error,
        );
      }
    }
    // ================================================================
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
    // فیلدهای پروفایل
    avatar: string;
    frame: string;
    title: string;
    // فیلدهای شخصی‌سازی
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
      select: prismaSelectUser,
    });
    return user;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function getUserWithProfile(userId: number) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: prismaSelectUser,
    });
    return user;
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
      select: prismaSelectUser,
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
      select: prismaSelectUser,
    });
    return user;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}
