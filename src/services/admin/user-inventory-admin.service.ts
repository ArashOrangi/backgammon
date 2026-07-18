import { prisma } from "@/components/prisma";

export class UserInventoryAdminService {
  // ===== اضافه کردن آیتم به کاربر =====
  async addItemToUser(
    userId: number,
    inventoryItemId: number,
    amount: number = 1,
  ) {
    const existing = await prisma.userInventoryItem.findFirst({
      where: { userId, inventoryItemId },
    });

    if (existing) {
      return prisma.userInventoryItem.update({
        where: { id: existing.id },
        data: { amount: existing.amount + amount },
      });
    } else {
      return prisma.userInventoryItem.create({
        data: {
          userId,
          inventoryItemId,
          amount,
          expirationDate: null,
        },
      });
    }
  }

  // ===== کم کردن آیتم از کاربر =====
  async removeItemFromUser(
    userId: number,
    inventoryItemId: number,
    amount: number = 1,
  ) {
    const existing = await prisma.userInventoryItem.findFirst({
      where: { userId, inventoryItemId },
    });

    if (!existing) {
      throw new Error("User does not own this item");
    }

    if (existing.amount < amount) {
      throw new Error("Insufficient amount");
    }

    const newAmount = existing.amount - amount;
    if (newAmount === 0) {
      return prisma.userInventoryItem.delete({
        where: { id: existing.id },
      });
    } else {
      return prisma.userInventoryItem.update({
        where: { id: existing.id },
        data: { amount: newAmount },
      });
    }
  }

  // ===== دریافت موجودی کامل کاربر =====
  async getUserInventory(userId: number) {
    return prisma.userInventoryItem.findMany({
      where: { userId },
      include: { inventoryItem: true },
    });
  }

  // ===== افزودن سکه به کاربر =====
  async addCoin(userId: number, amount: number) {
    const stats = await prisma.userStats.findUnique({ where: { userId } });
    if (!stats) {
      throw new Error("User stats not found");
    }
    return prisma.userStats.update({
      where: { userId },
      data: { coin: (stats.coin || 0) + amount },
    });
  }

  // ===== افزودن الماس به کاربر =====
  async addDiamond(userId: number, amount: number) {
    const stats = await prisma.userStats.findUnique({ where: { userId } });
    if (!stats) {
      throw new Error("User stats not found");
    }
    return prisma.userStats.update({
      where: { userId },
      data: { gem: (stats.gem || 0) + amount },
    });
  }
}
