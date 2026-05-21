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

export async function prismaUserCreate(userName: string) {
  try {
    const user = await prisma.users.create({
      data: {
        userName,
      },
      select: prismaSelectUser,
    });

    return user;
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
