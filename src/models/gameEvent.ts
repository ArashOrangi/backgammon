import { errorHandlersOnPrisma } from "@/components/errorHandler.ts";
import { prisma } from "@/components/prisma";
import { $Enums, Prisma } from "@prisma/client";

export interface GameEvent {
  id: number;
  gameId: number;
  type: $Enums.EVENTTYPE;
  payload: Prisma.JsonValue;
  sequence: number;
  createdAt: Date;
}

const prismaSelectGameEvent = {
  id: true,
  gameId: true,
  type: true,
  payload: true,
  sequence: true,
  createdAt: true,
};

export async function prismaGameEventCreate({
  gameId,
  payload,
  sequence,
  type,
}: {
  gameId: number;
  type: $Enums.EVENTTYPE;
  sequence: number;
  payload: Prisma.InputJsonValue;
}) {
  try {
    return await prisma.gameEvents.create({
      data: {
        gameId,
        sequence,
        type,
        payload,
      },
      select: prismaSelectGameEvent,
    });
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function prismaGameEventGetLastSequence(gameId: number) {
  try {
    const event = await prisma.gameEvents.findFirst({
      where: { gameId },
      orderBy: { sequence: "desc" },
      select: prismaSelectGameEvent,
    });

    return event;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function prismaGameEventAppend({
  gameId,
  type,
  payload,
}: {
  gameId: number;
  type: $Enums.EVENTTYPE;
  payload: Prisma.InputJsonValue;
}) {
  try {
    const last = await prisma.gameEvents.findFirst({
      where: { gameId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });

    const sequence = (last?.sequence ?? -1) + 1;

    const event = await prisma.gameEvents.create({
      data: {
        gameId,
        type,
        payload,
        sequence,
      },
      select: prismaSelectGameEvent,
    });

    return event;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function prismaGameEventGetAll(gameId: number) {
  try {
    const events = await prisma.gameEvents.findMany({
      where: { gameId },
      orderBy: { sequence: "asc" },
      select: prismaSelectGameEvent,
    });

    return events;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function prismaGameEventGetFromSequence({
  gameId,
  sequence,
}: {
  gameId: number;
  sequence: number;
}) {
  try {
    const events = await prisma.gameEvents.findMany({
      where: {
        gameId,
        sequence: { gt: sequence },
      },
      orderBy: { sequence: "asc" },
      select: prismaSelectGameEvent,
    });

    return events;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function prismaGameEventGetAfterSequence({
  gameId,
  sequence,
}: {
  gameId: number;
  sequence: number;
}) {
  try {
    const events = await prisma.gameEvents.findMany({
      where: {
        gameId,
        sequence: {
          gt: sequence,
        },
      },
      orderBy: {
        sequence: "asc",
      },
      select: prismaSelectGameEvent,
    });

    return events;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}
