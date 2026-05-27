import { errorHandlersOnPrisma } from "@/components/errorHandler";
import { prisma } from "@/components/prisma";
import { $Enums, Prisma } from "@prisma/client";
import { OrmState } from "./enums";

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
    // اگه ایونتی نبود، از -1 شروع می‌کنیم تا اولین ایونت بشه 0
    return event ? event.sequence : -1;
    // return event;
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
  untilSequence,
}: {
  gameId: number;
  sequence: number;
  untilSequence?: number;
}) {
  try {
    const events = await prisma.gameEvents.findMany({
      where: {
        gameId,
        sequence: {
          gt: sequence,
          ...(untilSequence !== undefined && { lte: untilSequence }),
        },
      },
      orderBy: {
        sequence: "asc",
      },
    });

    return events;
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function prismaGameEventsFind(gameId: number) {
  try {
    const events = await prisma.gameEvents.findMany({
      where: { gameId },
      orderBy: { sequence: "asc" },
    });

    return events;
  } catch (error) {
    return OrmState.Error;
  }
}

export async function getGameEvents(gameId: number) {
  return prisma.gameEvents.findMany({
    where: { gameId },
    orderBy: { sequence: "asc" },
  });
}

export async function prismaGameEventDeleteLastMove(
  gameId: number,
  playerId: number,
) {
  // پیدا کردن آخرین حرکت این بازیکن
  const lastMove = await prisma.gameEvents.findFirst({
    where: {
      gameId,
      type: "MOVE_APPLIED",
      payload: { path: ["playerId"], equals: playerId }, // جستجو در JSON payload
    },
    orderBy: { sequence: "desc" },
  });

  if (lastMove) {
    return await prisma.gameEvents.delete({
      where: { id: lastMove.id },
    });
  }
  return null;
}
