// ============================================================
// فایل: prisma/seed-inventory.ts
// ============================================================
// این فایل برای ایجاد آیتم‌های پایه کلکسیون (InventoryItem) استفاده می‌شود

import { prisma } from "../src/components/prisma";

const inventoryItems = [
  // ===== تاس‌ها (Dice) =====
  { name: "تاس کلاسیک سفید", visualCode: "dice_classic_white", usageType: "dice" },
  { name: "تاس کلاسیک مشکی", visualCode: "dice_classic_black", usageType: "dice" },
  { name: "تاس طلایی", visualCode: "dice_gold", usageType: "dice" },
  { name: "تاس نقره‌ای", visualCode: "dice_silver", usageType: "dice" },
  { name: "تاس یاقوتی", visualCode: "dice_ruby", usageType: "dice" },
  { name: "تاس فیروزه‌ای", visualCode: "dice_turquoise", usageType: "dice" },

  // ===== مهره‌ها (Checker) =====
  { name: "مهره کلاسیک سفید", visualCode: "checker_classic_white", usageType: "checker" },
  { name: "مهره کلاسیک مشکی", visualCode: "checker_classic_black", usageType: "checker" },
  { name: "مهره چوبی", visualCode: "checker_wood", usageType: "checker" },
  { name: "مهره سنگی", visualCode: "checker_stone", usageType: "checker" },
  { name: "مهره کریستالی", visualCode: "checker_crystal", usageType: "checker" },
  { name: "مهره کهکشانی", visualCode: "checker_galaxy", usageType: "checker" },

  // ===== لیوان‌ها (Cup) =====
  { name: "لیوان چرمی", visualCode: "cup_leather", usageType: "cup" },
  { name: "لیوان چوبی", visualCode: "cup_wood", usageType: "cup" },
  { name: "لیوان فلزی", visualCode: "cup_metal", usageType: "cup" },
  { name: "لیوان شیشه‌ای", visualCode: "cup_glass", usageType: "cup" },
  { name: "لیوان سلطنتی", visualCode: "cup_royal", usageType: "cup" },

  // ===== تخته‌ها (Board) =====
  { name: "تخته کلاسیک", visualCode: "board_classic", usageType: "board" },
  { name: "تخته چوبی", visualCode: "board_wood", usageType: "board" },
  { name: "تخته مرمری", visualCode: "board_marble", usageType: "board" },
  { name: "تخته طلایی", visualCode: "board_gold", usageType: "board" },
  { name: "تخته مدرن", visualCode: "board_modern", usageType: "board" },

  // ===== استیکرها (Sticker) =====
  { name: "استیکر خنده", visualCode: "sticker_smile", usageType: "sticker" },
  { name: "استیکر قلب", visualCode: "sticker_heart", usageType: "sticker" },
  { name: "استیکر ستاره", visualCode: "sticker_star", usageType: "sticker" },
  { name: "استیکر تاج", visualCode: "sticker_crown", usageType: "sticker" },
  { name: "استیکر پرچم", visualCode: "sticker_flag", usageType: "sticker" },

  // ===== آواتارها (Avatar) =====
  { name: "آواتار مرد ۱", visualCode: "avatar_man_1", usageType: "avatar" },
  { name: "آواتار مرد ۲", visualCode: "avatar_man_2", usageType: "avatar" },
  { name: "آواتار زن ۱", visualCode: "avatar_woman_1", usageType: "avatar" },
  { name: "آواتار زن ۲", visualCode: "avatar_woman_2", usageType: "avatar" },
  { name: "آواتار کودک", visualCode: "avatar_kid", usageType: "avatar" },
  { name: "آواتار کارتونی", visualCode: "avatar_cartoon", usageType: "avatar" },

  // ===== فریم‌ها (Frame) =====
  { name: "فریم طلایی", visualCode: "frame_gold", usageType: "frame" },
  { name: "فریم نقره‌ای", visualCode: "frame_silver", usageType: "frame" },
  { name: "فریم برنزی", visualCode: "frame_bronze", usageType: "frame" },
  { name: "فریم الماسی", visualCode: "frame_diamond", usageType: "frame" },
  { name: "فریم چوبی", visualCode: "frame_wood", usageType: "frame" },
];

async function main() {
  console.log("🌱 Seeding InventoryItem data...");

  for (const item of inventoryItems) {
    const existing = await prisma.inventoryItem.findFirst({
      where: { visualCode: item.visualCode },
    });
    if (!existing) {
      await prisma.inventoryItem.create({
        data: {
          name: item.name,
          visualCode: item.visualCode,
          usageType: Buffer.from(item.usageType), // تبدیل به Buffer برای Bytes
        },
      });
      console.log(`✅ InventoryItem ${item.name} created.`);
    } else {
      console.log(`⏩ InventoryItem ${item.name} already exists, skipping.`);
    }
  }

  console.log("🌱 Seeding InventoryItem completed.");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding inventory:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());