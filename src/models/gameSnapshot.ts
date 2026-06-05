import { errorHandlersOnPrisma } from "@/components/errorHandler";
import { prisma } from "@/components/prisma";
import { Prisma } from "@prisma/client";

export interface GameSnapshot {
  id: number;
  gameId: number;
  sequence: number;
  lastSequence: number;
  state: Prisma.JsonValue;
  createdAt: Date;
}

const prismaSelectGameSnapshot = {
  id: true,
  gameId: true,
  sequence: true,
  lastSequence: true,
  state: true,
  createdAt: true,
};

export async function prismaGameSnapshotGetLast(gameId: number) {
  try {
    const snapshot = await prisma.gameSnapshots.findFirst({
      where: { gameId },
      orderBy: { sequence: "desc" },
      select: prismaSelectGameSnapshot,
    });

    return snapshot;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function prismaGameSnapshotCreate({
  gameId,
  sequence,
  state,
}: {
  gameId: number;
  sequence: number;
  state: Prisma.InputJsonValue;
}) {
  try {
    console.log({ gameId, state });

    const snapshot = await prisma.gameSnapshots.create({
      data: {
        gameId,
        sequence,
        state,
      },
      select: prismaSelectGameSnapshot,
    });

    return snapshot;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}
