import { prisma } from "@/components/prisma";
import { errorHandlersOnPrisma } from "@/components/errorHandler";
import { OrmState } from "./enums";

export interface TimerPreset {
  id: number;
  name: string;
  primarySeconds: number;
  secondarySeconds: number;
  leagueLevel: number | null;
  gameType: string | null;
  isDefault: boolean;
}

export async function getTimerPresetByLeagueAndType(
  leagueLevel?: number,
  gameType?: string,
): Promise<TimerPreset | null> {
  try {
    // اولویت: تطابق دقیق با leagueLevel و gameType
    let preset = await prisma.timerPreset.findFirst({
      where: {
        leagueLevel: leagueLevel ?? null,
        gameType: gameType ?? null,
      },
    });
    if (preset) return preset;

    // اگر دقیق پیدا نشد، preset پیش‌فرض (isDefault = true)
    preset = await prisma.timerPreset.findFirst({ where: { isDefault: true } });
    return preset;
  } catch (error) {
    return errorHandlersOnPrisma({ error }) as any;
  }
}

export async function getAllTimerPresets() {
  try {
    return await prisma.timerPreset.findMany();
  } catch (error) {
    return OrmState.Error;
  }
}

export async function createTimerPreset(
  data: Omit<TimerPreset, "id" | "createdAt" | "updatedAt">,
) {
  try {
    return await prisma.timerPreset.create({ data });
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function updateTimerPreset(
  id: number,
  data: Partial<Omit<TimerPreset, "id">>,
) {
  try {
    return await prisma.timerPreset.update({ where: { id }, data });
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function deleteTimerPreset(id: number) {
  try {
    return await prisma.timerPreset.delete({ where: { id } });
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function getDefaultTimerPreset(): Promise<{
  primarySeconds: number;
  secondarySeconds: number;
}> {
  try {
    const preset = await prisma.timerPreset.findFirst({
      where: { isDefault: true },
    });
    if (preset) {
      return {
        primarySeconds: preset.primarySeconds,
        secondarySeconds: preset.secondarySeconds,
      };
    }
    // Fallback پیش‌فرض (اگر هیچ رکوردی در دیتابیس نباشد)
    console.warn(
      "No default timer preset found, using fallback values (12s / 120s)",
    );
    console.log("fuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuck");

    return { primarySeconds: 12, secondarySeconds: 120 };
  } catch (error) {
    console.error("Error fetching default timer preset:", error);

    return { primarySeconds: 12, secondarySeconds: 120 };
  }
}
