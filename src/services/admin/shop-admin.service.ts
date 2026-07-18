import { prisma } from "@/components/prisma";
import { ShopItemType, CurrencyType } from "@prisma/client";

export interface ShopItemInput {
  name: string;
  description?: string;
  type: ShopItemType;
  inventoryItemId?: number;
  coinPrice?: number;
  diamondPrice?: number;
  realPrice?: number;
  realCurrency?: string;
  discountCoinPrice?: number;
  discountDiamondPrice?: number;
  discountRealPrice?: number;
  discountStartDate?: Date;
  discountEndDate?: Date;
  packageItems?: any;
  packageCoin?: number;
  packageDiamond?: number;
  isActive?: boolean;
  sortOrder?: number;
  displayImage?: string;
}

export class ShopAdminService {
  // ===== ایجاد آیتم فروشگاهی =====
  async createItem(data: ShopItemInput) {
    return prisma.shopItem.create({
      data: {
        name: data.name,
        description: data.description,
        type: data.type,
        inventoryItemId: data.inventoryItemId,
        coinPrice: data.coinPrice,
        diamondPrice: data.diamondPrice,
        realPrice: data.realPrice,
        realCurrency: data.realCurrency,
        discountCoinPrice: data.discountCoinPrice,
        discountDiamondPrice: data.discountDiamondPrice,
        discountRealPrice: data.discountRealPrice,
        discountStartDate: data.discountStartDate,
        discountEndDate: data.discountEndDate,
        packageItems: data.packageItems,
        packageCoin: data.packageCoin,
        packageDiamond: data.packageDiamond,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder,
        displayImage: data.displayImage,
      },
    });
  }

  // ===== دریافت آیتم فروشگاهی با ID =====
  async getItem(id: number) {
    return prisma.shopItem.findUnique({
      where: { id },
      include: { inventoryItem: true },
    });
  }

  // ===== دریافت لیست تمام آیتم‌های فروشگاهی =====
  async getAllItems(includeInactive = false) {
    return prisma.shopItem.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { inventoryItem: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  // ===== بروزرسانی آیتم فروشگاهی =====
  async updateItem(id: number, data: Partial<ShopItemInput>) {
    return prisma.shopItem.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        type: data.type,
        inventoryItemId: data.inventoryItemId,
        coinPrice: data.coinPrice,
        diamondPrice: data.diamondPrice,
        realPrice: data.realPrice,
        realCurrency: data.realCurrency,
        discountCoinPrice: data.discountCoinPrice,
        discountDiamondPrice: data.discountDiamondPrice,
        discountRealPrice: data.discountRealPrice,
        discountStartDate: data.discountStartDate,
        discountEndDate: data.discountEndDate,
        packageItems: data.packageItems,
        packageCoin: data.packageCoin,
        packageDiamond: data.packageDiamond,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
        displayImage: data.displayImage,
      },
    });
  }

  // ===== حذف آیتم فروشگاهی =====
  async deleteItem(id: number) {
    return prisma.shopItem.delete({
      where: { id },
    });
  }

  // ===== تغییر وضعیت فعال/غیرفعال =====
  async toggleActive(id: number, isActive: boolean) {
    return prisma.shopItem.update({
      where: { id },
      data: { isActive },
    });
  }
}
