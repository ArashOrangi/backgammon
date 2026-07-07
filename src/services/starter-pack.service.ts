import { prisma } from "@/components/prisma";

// تعریف بسته‌های شروع (Starter Packs)
const STARTER_PACKS = [
  {
    id: "starter_classic",
    name: "بسته کلاسیک",
    description: "آیتم‌های پایه برای شروع بازی",
    items: [
      { visualCode: "dice_classic_white", amount: 1 },
      { visualCode: "checker_classic_white", amount: 1 },
      { visualCode: "cup_leather", amount: 1 },
      { visualCode: "board_classic", amount: 1 },
      { visualCode: "sticker_smile", amount: 1 },
      { visualCode: "avatar_man_1", amount: 1 },
      { visualCode: "frame_silver", amount: 1 },
    ],
    coin: 1000,
    diamond: 10,
  },
  {
    id: "starter_premium",
    name: "بسته ویژه",
    description: "آیتم‌های ویژه برای شروع بهتر",
    items: [
      { visualCode: "dice_gold", amount: 1 },
      { visualCode: "checker_wood", amount: 1 },
      { visualCode: "cup_royal", amount: 1 },
      { visualCode: "board_marble", amount: 1 },
      { visualCode: "sticker_crown", amount: 1 },
      { visualCode: "avatar_cartoon", amount: 1 },
      { visualCode: "frame_gold", amount: 1 },
    ],
    coin: 2500,
    diamond: 25,
  },
  {
    id: "starter_legendary",
    name: "بسته افسانه‌ای",
    description: "آیتم‌های نادر و خاص",
    items: [
      { visualCode: "dice_ruby", amount: 1 },
      { visualCode: "checker_crystal", amount: 1 },
      { visualCode: "cup_metal", amount: 1 },
      { visualCode: "board_gold", amount: 1 },
      { visualCode: "sticker_star", amount: 1 },
      { visualCode: "avatar_woman_2", amount: 1 },
      { visualCode: "frame_diamond", amount: 1 },
    ],
    coin: 5000,
    diamond: 50,
  },
];

/**
 * دریافت یک بسته شروع به صورت رندوم
 */
function getRandomStarterPack() {
  const randomIndex = Math.floor(Math.random() * STARTER_PACKS.length);
  return STARTER_PACKS[randomIndex];
}

/**
 * دریافت بسته شروع بر اساس شناسه
 */
function getStarterPackById(id: string) {
  return STARTER_PACKS.find((pkg) => pkg.id === id);
}

/**
 * اعمال بسته شروع به کاربر جدید
 * @param userId شناسه کاربر
 * @param packId (اختیاری) شناسه بسته، اگر نباشد رندوم انتخاب می‌شود
 */
export async function applyStarterPackToUser(userId: number, packId?: string) {
  let pack = packId ? getStarterPackById(packId) : null;
  if (!pack) {
    pack = getRandomStarterPack();
  }

  console.log(`🎁 Applying starter pack "${pack.name}" to user ${userId}...`);

  // ۱. اعطای آیتم‌ها به کاربر
  for (const item of pack.items) {
    // دریافت inventoryItemId بر اساس visualCode
    const inventoryItem = await prisma.inventoryItem.findFirst({
      where: { visualCode: item.visualCode },
    });
    if (!inventoryItem) {
      console.warn(
        `⚠️ InventoryItem with visualCode ${item.visualCode} not found, skipping.`,
      );
      continue;
    }

    // بررسی آیا کاربر این آیتم را قبلاً دارد
    const existing = await prisma.userInventoryItem.findFirst({
      where: {
        userId,
        inventoryItemId: inventoryItem.id,
      },
    });

    if (existing) {
      await prisma.userInventoryItem.update({
        where: { id: existing.id },
        data: { amount: existing.amount + item.amount },
      });
    } else {
      await prisma.userInventoryItem.create({
        data: {
          userId,
          inventoryItemId: inventoryItem.id,
          amount: item.amount,
          expirationDate: null, // دائمی
        },
      });
    }
  }

  // ۲. اعطای سکه و الماس
  if (pack.coin > 0 || pack.diamond > 0) {
    const stats = await prisma.userStats.findUnique({
      where: { userId },
    });
    if (stats) {
      await prisma.userStats.update({
        where: { userId },
        data: {
          coin: (stats.coin || 0) + pack.coin,
          gem: (stats.gem || 0) + pack.diamond,
        },
      });
    } else {
      // اگر UserStats وجود نداشته باشد (که نباید)، آن را ایجاد می‌کنیم
      await prisma.userStats.create({
        data: {
          userId,
          coin: pack.coin,
          gem: pack.diamond,
          xp: 0,
          level: 1,
        },
      });
    }
  }

  // ۳. انتخاب خودکار برخی آیتم‌ها (اولین آیتم از هر دسته)
  // بهترین کار این است که آیتم‌های انتخابی را به‌روز کنیم
  // برای سادگی، اولین آیتم از هر دسته را به‌عنوان انتخاب شده تنظیم می‌کنیم
  await autoSelectItemsForUser(userId, pack.items);

  console.log(
    `✅ Starter pack "${pack.name}" applied successfully to user ${userId}`,
  );
  return pack;
}

/**
 * انتخاب خودکار آیتم‌ها برای کاربر (اولین آیتم از هر دسته)
 */
async function autoSelectItemsForUser(
  userId: number,
  items: Array<{ visualCode: string; amount: number }>,
) {
  // گروه‌بندی آیتم‌ها بر اساس usageType
  const grouped: Record<string, string[]> = {};
  for (const item of items) {
    const inventoryItem = await prisma.inventoryItem.findFirst({
      where: { visualCode: item.visualCode },
    });
    if (!inventoryItem) continue;
    const usageType = inventoryItem.usageType.toString();
    if (!grouped[usageType]) grouped[usageType] = [];
    grouped[usageType].push(item.visualCode);
  }

  // برای هر دسته، اولین آیتم را انتخاب کن
  const updates: any = {};
  for (const [type, codes] of Object.entries(grouped)) {
    if (codes.length === 0) continue;
    const firstItem = await prisma.inventoryItem.findFirst({
      where: { visualCode: codes[0] },
    });
    if (!firstItem) continue;

    switch (type) {
      case "dice":
        updates.selectedDiceId = firstItem.id;
        break;
      case "checker":
        updates.selectedCheckerId = firstItem.id;
        break;
      case "cup":
        updates.selectedCupId = firstItem.id;
        break;
      case "board":
        updates.selectedBoardId = firstItem.id;
        break;
      case "sticker":
        updates.selectedStickerId = firstItem.id;
        break;
      case "avatar":
        updates.selectedAvatarId = firstItem.id;
        break;
      case "frame":
        updates.selectedFrameId = firstItem.id;
        break;
    }
  }

  if (Object.keys(updates).length > 0) {
    await prisma.user.update({
      where: { id: userId },
      data: updates,
    });
  }
}

/**
 * دریافت لیست تمام بسته‌های شروع (برای نمایش در UI)
 */
export function getStarterPacks() {
  return STARTER_PACKS;
}
