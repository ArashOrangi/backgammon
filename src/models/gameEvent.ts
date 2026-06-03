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
  isUndo: boolean;
}

const prismaSelectGameEvent = {
  id: true,
  gameId: true,
  type: true,
  payload: true,
  sequence: true,
  createdAt: true,
  isUndo: true,
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
    return event ? event.sequence : -1;
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
      where: { gameId, isUndo: false },
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
        isUndo: false,
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
    return await prisma.gameEvents.findMany({
      where: {
        gameId,
        isUndo: false,
        sequence: {
          gt: sequence,
          ...(untilSequence !== undefined && { lte: untilSequence }),
        },
      },
      orderBy: { sequence: "asc" },
    });
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function prismaGameEventsFind(gameId: number) {
  try {
    const events = await prisma.gameEvents.findMany({
      where: { gameId, isUndo: false }, // اصلاح: فقط ایونت‌های معتبر
      orderBy: { sequence: "asc" },
    });
    return events;
  } catch (error) {
    return OrmState.Error;
  }
}

export async function getGameEvents(gameId: number) {
  return prisma.gameEvents.findMany({
    where: { gameId, isUndo: false }, // اصلاح: فقط ایونت‌های معتبر
    orderBy: { sequence: "asc" },
  });
}

// تابع زیر فقط برای سازگاری با کدهای قدیمی نگهداری شده است، استفاده از آن توصیه نمی‌شود.
export async function prismaGameEventDeleteLastMove(
  gameId: number,
  playerId: number,
) {
  const lastMove = await prisma.gameEvents.findFirst({
    where: {
      gameId,
      type: "MOVE_APPLIED",
      payload: { path: ["playerId"], equals: playerId },
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

export async function prismaGameEventMarkAsUndo(
  gameId: number,
  playerId: number,
) {
  try {
    const lastMove = await prisma.gameEvents.findFirst({
      where: {
        gameId,
        type: "MOVE_APPLIED",
        isUndo: false,
        payload: { path: ["playerId"], equals: playerId },
      },
      orderBy: { sequence: "desc" },
    });
    if (!lastMove) return null;
    return await prisma.gameEvents.update({
      where: { id: lastMove.id },
      data: { isUndo: true },
      select: prismaSelectGameEvent,
    });
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}
