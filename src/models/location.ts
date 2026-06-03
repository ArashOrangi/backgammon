import { prisma } from "@/components/prisma";
import { OrmState } from "./enums";

export async function getAllProvinces(includeInactive = false) {
  try {
    return await prisma.provinces.findMany({
      where: { isActive: includeInactive ? undefined : true },
      orderBy: { faName: "asc" },
      select: { id: true, faName: true, enName: true, isCapital: true },
    });
  } catch (error) {
    return OrmState.Error;
  }
}

export async function getCitiesByProvince(
  provinceId: number,
  includeInactive = false,
) {
  try {
    return await prisma.cities.findMany({
      where: {
        provinceId,
        isActive: includeInactive ? undefined : true,
      },
      orderBy: { faName: "asc" },
      select: {
        id: true,
        faName: true,
        enName: true,
        isCapital: true,
        latitude: true,
        longitude: true,
      },
    });
  } catch (error) {
    return OrmState.Error;
  }
}
