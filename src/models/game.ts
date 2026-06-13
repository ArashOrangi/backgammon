import { errorHandlersOnPrisma } from "@/components/errorHandler";
import { prisma } from "@/components/prisma";
import { $Enums, RoomType } from "@prisma/client";

export interface Game {
  id: number;
  status: $Enums.GAMESTATUS;
  whitePlayerId: number | null;
  blackPlayerId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const prismaSelectGame = {
  id: true,
  status: true,
  whitePlayerId: true,
  blackPlayerId: true,
  createdAt: true,
  updatedAt: true,
};

export async function prismaGameCreate(
  whitePlayerId: number,
  roomType?: RoomType,
) {
  try {
    const game = await prisma.games.create({
      data: {
        whitePlayerId,
        roomType,
      },
      select: prismaSelectGame,
    });

    return game;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function prismaGameGetById(id: number) {
  try {
    const game = await prisma.games.findUnique({
      where: { id },
      select: prismaSelectGame,
    });

    return game;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function prismaGameJoin({
  gameId,
  blackPlayerId,
}: {
  gameId: number;
  blackPlayerId: number;
}) {
  try {
    const game = await prisma.games.update({
      where: { id: gameId },
      data: {
        blackPlayerId,
        status: "ACTIVE",
      },
      select: prismaSelectGame,
    });

    return game;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function prismaGameFinish(gameId: number) {
  try {
    const game = await prisma.games.update({
      where: { id: gameId },
      data: {
        status: "FINISHED",
      },
      select: prismaSelectGame,
    });

    return game;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function prismaGameGetInfo(gameId: number) {
  try {
    const game = await prisma.games.findUnique({
      where: { id: gameId },
      select: { roomType: true, createdAt: true },
    });
    return game;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}
