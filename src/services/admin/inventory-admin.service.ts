import { prisma } from "@/components/prisma";
import { UsageType } from "@prisma/client";

export interface InventoryItemInput {
  name: string;
  visualCode: string;
  usageType: UsageType;
}

export class InventoryAdminService {
  // ===== ایجاد آیتم جدید =====
  async createItem(data: InventoryItemInput) {
    return prisma.inventoryItem.create({
      data: {
        name: data.name,
        visualCode: data.visualCode,
        usageType: data.usageType,
      },
    });
  }

  // ===== دریافت آیتم با ID =====
  async getItem(id: number) {
    return prisma.inventoryItem.findUnique({
      where: { id },
    });
  }

  // ===== دریافت لیست تمام آیتم‌ها =====
  async getAllItems() {
    return prisma.inventoryItem.findMany({
      orderBy: { id: "asc" },
    });
  }

  // ===== بروزرسانی آیتم =====
  async updateItem(id: number, data: Partial<InventoryItemInput>) {
    return prisma.inventoryItem.update({
      where: { id },
      data: {
        name: data.name,
        visualCode: data.visualCode,
        usageType: data.usageType,
      },
    });
  }

  // ===== حذف آیتم (واقعی) =====
  async deleteItem(id: number) {
    // بررسی وجود آیتم در ShopItem یا UserInventoryItem
    const inShop = await prisma.shopItem.findFirst({
      where: { inventoryItemId: id },
    });
    if (inShop) {
      throw new Error("Cannot delete: item is linked to a shop item");
    }

    const inUserInventory = await prisma.userInventoryItem.findFirst({
      where: { inventoryItemId: id },
    });
    if (inUserInventory) {
      throw new Error("Cannot delete: item is owned by at least one user");
    }

    return prisma.inventoryItem.delete({
      where: { id },
    });
  }
}
