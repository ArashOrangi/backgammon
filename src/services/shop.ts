// ============================================================
// فایل: services/shop.service.ts
// ============================================================

import { prisma } from "@/components/prisma";
import { ShopItemType, CurrencyType } from "@prisma/client";

/**
 * دریافت لیست آیتم‌های فروشگاه (فقط آیتم‌های فعال)
 */
export async function getShopItems() {
  const items = await prisma.shopItem.findMany({
    where: { isActive: true },
    include: {
      inventoryItem: true,
    },
    orderBy: { sortOrder: "asc" },
  });
  return items;
}

/**
 * خرید یک آیتم از فروشگاه
 * @param userId شناسه کاربر
 * @param shopItemId شناسه آیتم فروشگاه
 * @param currencyType نوع ارز پرداختی (COIN, DIAMOND, REAL)
 * @param realAmount در صورت پرداخت با پول واقعی، مبلغ پرداختی
 * @param realCurrency واحد پول واقعی
 */
export async function purchaseShopItem(
  userId: number,
  shopItemId: number,
  currencyType: CurrencyType,
  realAmount?: number,
  realCurrency?: string,
) {
  // ۱. دریافت آیتم فروشگاه
  const shopItem = await prisma.shopItem.findUnique({
    where: { id: shopItemId },
    include: { inventoryItem: true },
  });
  if (!shopItem || !shopItem.isActive) {
    throw new Error("Shop item not found or inactive");
  }

  // ۲. محاسبه قیمت نهایی بر اساس تخفیف‌ها
  const now = new Date();
  const isDiscounted =
    shopItem.discountStartDate &&
    shopItem.discountEndDate &&
    now >= shopItem.discountStartDate &&
    now <= shopItem.discountEndDate;

  let finalPrice: number | null = null;
  switch (currencyType) {
    case "COIN":
      if (
        isDiscounted &&
        shopItem.discountCoinPrice !== null &&
        shopItem.discountCoinPrice !== undefined
      ) {
        finalPrice = shopItem.discountCoinPrice;
      } else {
        finalPrice = shopItem.coinPrice;
      }
      break;
    case "DIAMOND":
      if (
        isDiscounted &&
        shopItem.discountDiamondPrice !== null &&
        shopItem.discountDiamondPrice !== undefined
      ) {
        finalPrice = shopItem.discountDiamondPrice;
      } else {
        finalPrice = shopItem.diamondPrice;
      }
      break;
    case "REAL":
      if (
        isDiscounted &&
        shopItem.discountRealPrice !== null &&
        shopItem.discountRealPrice !== undefined
      ) {
        finalPrice = shopItem.discountRealPrice;
      } else {
        finalPrice = shopItem.realPrice;
      }
      break;
  }

  if (finalPrice == null) {
    throw new Error("Price not available for this currency type");
  }

  // ۳. اعتبارسنجی موجودی کاربر (برای COIN و DIAMOND)
  const userStats = await prisma.userStats.findUnique({
    where: { userId },
  });
  if (!userStats) throw new Error("User stats not found");

  if (currencyType === "COIN") {
    const currentCoin = userStats.coin || 0;
    if (currentCoin < finalPrice) {
      throw new Error("Insufficient coin balance");
    }
    // کسر سکه
    await prisma.userStats.update({
      where: { userId },
      data: { coin: currentCoin - finalPrice },
    });
  } else if (currencyType === "DIAMOND") {
    const currentDiamond = userStats.gem || 0;
    if (currentDiamond < finalPrice) {
      throw new Error("Insufficient diamond balance");
    }
    await prisma.userStats.update({
      where: { userId },
      data: { gem: currentDiamond - finalPrice },
    });
  } else if (currencyType === "REAL") {
    // پرداخت با پول واقعی – نیاز به درگاه پرداخت خارج از این تابع انجام می‌شود
    // در اینجا فقط فرض می‌کنیم که پرداخت قبلاً تأیید شده است
    // برای امنیت، بهتر است تراکنش را در یک تراکنش دیتابیس انجام دهیم
  }

  // ۴. اعطای آیتم‌ها به کاربر
  await grantShopItemToUser(userId, shopItem);

  // ۵. ثبت تراکنش خرید
  const transaction = await prisma.shopTransaction.create({
    data: {
      userId,
      shopItemId,
      pricePaid: finalPrice,
      currencyType,
      realAmount: currencyType === "REAL" ? realAmount : null,
      realCurrency: currencyType === "REAL" ? realCurrency : null,
    },
  });

  return transaction;
}

/**
 * اعطای آیتم‌های یک ShopItem به کاربر
 */
async function grantShopItemToUser(userId: number, shopItem: any) {
  if (shopItem.type === "ITEM" && shopItem.inventoryItemId) {
    // آیتم تکی
    await addInventoryItemToUser(userId, shopItem.inventoryItemId, 1);
  } else if (shopItem.type === "PACKAGE") {
    // پکیج: شامل آیتم‌ها و ارزها
    const packageItems = shopItem.packageItems as Array<{
      inventoryItemId: number;
      amount: number;
    }> | null;
    if (packageItems) {
      for (const pkg of packageItems) {
        await addInventoryItemToUser(userId, pkg.inventoryItemId, pkg.amount);
      }
    }
    // اعطای سکه و الماس
    if (shopItem.packageCoin) {
      await addCoinToUser(userId, shopItem.packageCoin);
    }
    if (shopItem.packageDiamond) {
      await addDiamondToUser(userId, shopItem.packageDiamond);
    }
  } else if (shopItem.type === "CURRENCY") {
    // پکیج ارزی
    if (shopItem.packageCoin) {
      await addCoinToUser(userId, shopItem.packageCoin);
    }
    if (shopItem.packageDiamond) {
      await addDiamondToUser(userId, shopItem.packageDiamond);
    }
  }
}

async function addInventoryItemToUser(
  userId: number,
  inventoryItemId: number,
  amount: number,
) {
  // بررسی وجود آیتم در موجودی کاربر
  const existing = await prisma.userInventoryItem.findFirst({
    where: { userId, inventoryItemId },
  });
  if (existing) {
    await prisma.userInventoryItem.update({
      where: { id: existing.id },
      data: { amount: existing.amount + amount },
    });
  } else {
    await prisma.userInventoryItem.create({
      data: {
        userId,
        inventoryItemId,
        amount,
        expirationDate: null, // دائمی
      },
    });
  }
}

async function addCoinToUser(userId: number, amount: number) {
  const stats = await prisma.userStats.findUnique({ where: { userId } });
  if (!stats) throw new Error("User stats not found");
  await prisma.userStats.update({
    where: { userId },
    data: { coin: (stats.coin || 0) + amount },
  });
}

async function addDiamondToUser(userId: number, amount: number) {
  const stats = await prisma.userStats.findUnique({ where: { userId } });
  if (!stats) throw new Error("User stats not found");
  await prisma.userStats.update({
    where: { userId },
    data: { gem: (stats.gem || 0) + amount },
  });
}
