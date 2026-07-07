import { prisma } from "@/components/prisma";

/**
 * دریافت لیست آیتم‌های موجود در کلکسیون کاربر، گروه‌بندی شده بر اساس نوع
 */
export async function getUserCollection(userId: number) {
  // دریافت تمام آیتم‌های موجودی کاربر همراه با اطلاعات InventoryItem
  const userItems = await prisma.userInventoryItem.findMany({
    where: { userId },
    include: {
      inventoryItem: true,
    },
  });

  // گروه‌بندی بر اساس usageType
  const grouped: Record<string, any[]> = {};
  for (const item of userItems) {
    const type = item.inventoryItem.usageType.toString(); // usageType از نوع Bytes است، تبدیل به رشته
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push({
      ...item,
      inventoryItem: {
        ...item.inventoryItem,
        usageType: type,
      },
    });
  }

  return grouped;
}

/**
 * انتخاب یک آیتم برای استفاده (تنظیم selected در User)
 * @param userId شناسه کاربر
 * @param inventoryItemId شناسه آیتم
 * @param category نوع آیتم (dice, checker, cup, board, sticker, avatar, frame)
 */
export async function selectItem(
  userId: number,
  inventoryItemId: number,
  category: string,
) {
  // ۱. بررسی مالکیت آیتم
  const userItem = await prisma.userInventoryItem.findFirst({
    where: { userId, inventoryItemId },
  });
  if (!userItem) {
    throw new Error("Item not owned");
  }

  // ۲. به‌روزرسانی فیلد مربوطه در User
  const updateData: any = {};
  switch (category) {
    case "dice":
      updateData.selectedDiceId = inventoryItemId;
      break;
    case "checker":
      updateData.selectedCheckerId = inventoryItemId;
      break;
    case "cup":
      updateData.selectedCupId = inventoryItemId;
      break;
    case "board":
      updateData.selectedBoardId = inventoryItemId;
      break;
    case "sticker":
      updateData.selectedStickerId = inventoryItemId;
      break;
    case "avatar":
      updateData.selectedAvatarId = inventoryItemId;
      // همچنین می‌توان avatar را به‌روز کرد (اگر می‌خواهیم مستقیماً آدرس را ذخیره کنیم)
      // ولی بهتر است avatar را از visualCode بگیریم
      break;
    case "frame":
      updateData.selectedFrameId = inventoryItemId;
      break;
    default:
      throw new Error("Invalid category");
  }

  await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  return { success: true };
}

/**
 * دریافت آیتم‌های انتخابی کاربر (برای نمایش در بازی)
 */
export async function getUserSelectedItems(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      selectedDice: true,
      selectedChecker: true,
      selectedCup: true,
      selectedBoard: true,
      selectedSticker: true,
      selectedAvatar: true,
      selectedFrame: true,
    },
  });
  if (!user) throw new Error("User not found");

  return {
    dice: user.selectedDice,
    checker: user.selectedChecker,
    cup: user.selectedCup,
    board: user.selectedBoard,
    sticker: user.selectedSticker,
    avatar: user.selectedAvatar,
    frame: user.selectedFrame,
  };
}
