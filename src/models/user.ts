import { errorHandlersOnPrisma } from "@/components/errorHandler";
import { prisma } from "@/components/prisma";

export interface User {
  id: number;
  userName: string;
  winRate: number;
  createdAt: Date;
  updatedAt: Date;
}

const prismaSelectUser = {
  id: true,
  userName: true,
  winRate: true,
  createdAt: true,
  updatedAt: true,
};

export async function prismaUserGetOrCreate(userName: string) {
  try {
    // ۱. اول سعی می‌کنیم پیدا کنیم
    const existingUser = await prisma.users.findUnique({
      where: { userName },
      select: prismaSelectUser,
    });

    if (existingUser) return existingUser;

    // ۲. اگه نبود، می‌سازیم
    const newUser = await prisma.users.create({
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
    const user = await prisma.users.findUnique({
      where: { id },
      select: prismaSelectUser,
    });

    return user;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function prismaUserGetByUserName(userName: string) {
  try {
    const user = await prisma.users.findUnique({
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
    const user = await prisma.users.update({
      where: { id: userId },
      data: {
        winRate,
      },
      select: prismaSelectUser,
    });

    return user;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function generateGuestUsername(): Promise<string> {
  const guests = await prisma.users.findMany({
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

export async function createUserWithProfile(data: {
  userName?: string;
  fullName?: string;
  provinceId?: number;
  cityId?: number;
  image?: string;
  mobile?: string;
  gender?: "MAN" | "WOMAN" | "OTHER";
}) {
  const { userName, fullName, provinceId, cityId, image, mobile, gender } =
    data;

  const finalUserName = userName || (await generateGuestUsername());

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. ایجاد کاربر
      const user = await tx.users.create({
        data: {
          userName: finalUserName,
          gender: gender || "MAN",
        },
      });
      // 2. ایجاد پروفایل با همان id
      const profile = await tx.profile.create({
        data: {
          id: user.id,
          fullName: fullName || "",
          provinceId: provinceId || null,
          cityId: cityId || null,
          image: image || null,
          mobile: mobile || null,
        },
      });
      return { user, profile };
    });
    return result;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function updateUserProfile(
  userId: number,
  data: Partial<{
    fullName: string;
    provinceId: number;
    cityId: number;
    image: string;
    mobile: string;
  }>,
) {
  try {
    const profile = await prisma.profile.update({
      where: { id: userId },
      data,
    });
    return profile;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function getUserWithProfile(userId: number) {
  try {
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: { profile: true },
    });
    return user;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}
