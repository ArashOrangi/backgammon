// models/user.ts
import { errorHandlersOnPrisma } from "@/components/errorHandler";
import { prisma } from "@/components/prisma";
import { Prisma } from "@prisma/client";
import { JsonValue } from "@prisma/client/runtime/client";

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
  recentResults: JsonValue; // به جای boolean[]
  recentOpponents: JsonValue; // به جای any[]
  createdAt: Date;
  updatedAt: Date;
  // سایر فیلدها (اختیاری)
  gender?: "MAN" | "WOMAN" | "OTHER";
  level?: number | null;
  password?: string | null;
  fullName?: string | null;
  image?: string | null;
  mobile?: string | null;
  provinceId?: number | null;
  cityId?: number | null;
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
  // fullName: true,
  image: true,
  mobile: true,
  provinceId: true,
  cityId: true,
};

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

// ------------------- توابع پروفایل (بدون جدول Profile) -------------------

export async function createUserWithProfile(data: {
  userName?: string;
  // fullName?: string;
  provinceId?: number;
  cityId?: number;
  // image?: string;
  phoneNumber?: string;
  gender?: "MAN" | "WOMAN" | "OTHER";
}) {
  const { userName, provinceId, cityId, phoneNumber, gender } = data;
  const finalUsername = userName || (await generateGuestUsername());

  try {
    const user = await prisma.user.create({
      data: {
        userName: finalUsername,
        gender: gender || "MAN",
        // fullName: fullName || null,
        provinceId: provinceId || null,
        cityId: cityId || null,
        // image: image || null,
        phoneNumber: phoneNumber || null,
      },
      select: prismaSelectUser,
    });
    return user;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function updateUserProfile(
  userId: number,
  data: Partial<{
    // fullName: string;
    provinceId: number;
    cityId: number;
    image: string;
    mobile: string;
    password: string;
    phoneNumber: string;
    gender: "MAN" | "WOMAN" | "OTHER";
    level: number;
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
    recentResults: boolean[];
    recentOpponents: any[];
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
