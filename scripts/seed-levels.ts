// ============================================================
// فایل: prisma/seed-levels.ts
// ============================================================
// این فایل برای مقداردهی اولیه LevelIntrepeter استفاده می‌شود

import { prisma } from "../src/components/prisma";

// داده‌های سطوح بر اساس مستندات Progression System Economy.pdf
// cumulativeXP و xpToNext برای سطوح ۱ تا ۴۱
const levelsData = [
  { level: 1, cumulativeXP: 0, xpToNext: 40 },
  { level: 2, cumulativeXP: 40, xpToNext: 50 },
  { level: 3, cumulativeXP: 90, xpToNext: 60 },
  { level: 4, cumulativeXP: 150, xpToNext: 70 },
  { level: 5, cumulativeXP: 220, xpToNext: 80 },
  { level: 6, cumulativeXP: 300, xpToNext: 90 },
  { level: 7, cumulativeXP: 390, xpToNext: 100 },
  { level: 8, cumulativeXP: 490, xpToNext: 110 },
  { level: 9, cumulativeXP: 600, xpToNext: 120 },
  { level: 10, cumulativeXP: 720, xpToNext: 130 },
  { level: 11, cumulativeXP: 850, xpToNext: 140 },
  { level: 12, cumulativeXP: 990, xpToNext: 150 },
  { level: 13, cumulativeXP: 1140, xpToNext: 160 },
  { level: 14, cumulativeXP: 1300, xpToNext: 170 },
  { level: 15, cumulativeXP: 1470, xpToNext: 180 },
  { level: 16, cumulativeXP: 1650, xpToNext: 190 },
  { level: 17, cumulativeXP: 1840, xpToNext: 200 },
  { level: 18, cumulativeXP: 2040, xpToNext: 210 },
  { level: 19, cumulativeXP: 2250, xpToNext: 220 },
  { level: 20, cumulativeXP: 2470, xpToNext: 230 },
  { level: 21, cumulativeXP: 2700, xpToNext: 240 },
  { level: 22, cumulativeXP: 2940, xpToNext: 250 },
  { level: 23, cumulativeXP: 3190, xpToNext: 260 },
  { level: 24, cumulativeXP: 3450, xpToNext: 270 },
  { level: 25, cumulativeXP: 3720, xpToNext: 280 },
  { level: 26, cumulativeXP: 4000, xpToNext: 290 },
  { level: 27, cumulativeXP: 4290, xpToNext: 300 },
  { level: 28, cumulativeXP: 4590, xpToNext: 310 },
  { level: 29, cumulativeXP: 4900, xpToNext: 320 },
  { level: 30, cumulativeXP: 5220, xpToNext: 330 },
  { level: 31, cumulativeXP: 5550, xpToNext: 340 },
  { level: 32, cumulativeXP: 5890, xpToNext: 350 },
  { level: 33, cumulativeXP: 6240, xpToNext: 360 },
  { level: 34, cumulativeXP: 6600, xpToNext: 370 },
  { level: 35, cumulativeXP: 6970, xpToNext: 380 },
  { level: 36, cumulativeXP: 7350, xpToNext: 390 },
  { level: 37, cumulativeXP: 7740, xpToNext: 400 },
  { level: 38, cumulativeXP: 8140, xpToNext: 410 },
  { level: 39, cumulativeXP: 8550, xpToNext: 420 },
  { level: 40, cumulativeXP: 8970, xpToNext: 430 },
  { level: 41, cumulativeXP: 9400, xpToNext: null }, // آخرین سطح، نیازی به xpToNext نیست
];

async function main() {
  console.log("🌱 Seeding LevelIntrepeter data...");

  for (const level of levelsData) {
    const existing = await prisma.levelIntrepeter.findUnique({
      where: { xp: level.cumulativeXP },
    });
    if (!existing) {
      await prisma.levelIntrepeter.create({
        data: {
          xp: level.cumulativeXP,
          level: level.level,
          cumulativeXP: level.cumulativeXP,
          xpToNext: level.xpToNext,
        },
      });
      console.log(
        `✅ Level ${level.level} (XP: ${level.cumulativeXP}) created.`,
      );
    } else {
      console.log(`⏩ Level ${level.level} already exists, skipping.`);
    }
  }

  console.log("🌱 Seeding LevelIntrepeter completed.");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding levels:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
