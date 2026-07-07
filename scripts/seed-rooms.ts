// ============================================================
// فایل: prisma/seed-rooms.ts
// ============================================================
// این فایل برای مقداردهی اولیه RoomPreset ها استفاده می‌شود
// شناسه‌ها: 1=CASUAL_1, 2=CASUAL_2, 3=COMPETITIVE_1, 4=COMPETITIVE_2

import { prisma } from "../src/components/prisma";

async function main() {
  console.log("🌱 Seeding RoomPreset data...");

  const rooms = [
    {
      id: 1, // CASUAL_1
      minXp: 0,
      matchmakingQueue: 10,
      coinBuyIn: 100,
      coinReward: 180,
      timer: 1,
      doublingCube: 0, // غیرفعال
      undo: 1,
      rewardXp: 0,
      leaderboardPoint: 0,
      baseWinXP: 14,
      baseLoseXP: 10,
      spread: 4,
    },
    {
      id: 2, // CASUAL_2
      minXp: 90,
      matchmakingQueue: 12,
      coinBuyIn: 2000,
      coinReward: 3600,
      timer: 1,
      doublingCube: 1, // فعال
      undo: 1,
      rewardXp: 0,
      leaderboardPoint: 0,
      baseWinXP: 23,
      baseLoseXP: 15,
      spread: 8,
    },
    {
      id: 3, // COMPETITIVE_1
      minXp: 1840,
      matchmakingQueue: 15,
      coinBuyIn: 30000,
      coinReward: 54000,
      timer: 1,
      doublingCube: 1,
      undo: 1,
      rewardXp: 0,
      leaderboardPoint: 0,
      baseWinXP: 29,
      baseLoseXP: 21,
      spread: 8,
    },
    {
      id: 4, // COMPETITIVE_2
      minXp: 5550,
      matchmakingQueue: 18,
      coinBuyIn: 350000,
      coinReward: 630000,
      timer: 1,
      doublingCube: 1,
      undo: 1,
      rewardXp: 0,
      leaderboardPoint: 0,
      baseWinXP: 36,
      baseLoseXP: 28,
      spread: 8,
    },
  ];

  for (const room of rooms) {
    const existing = await prisma.roomPreset.findUnique({
      where: { id: room.id },
    });
    if (!existing) {
      await prisma.roomPreset.create({
        data: room,
      });
      console.log(`✅ RoomPreset ${room.id} created.`);
    } else {
      console.log(`⏩ RoomPreset ${room.id} already exists, skipping.`);
    }
  }

  console.log("🌱 Seeding RoomPreset completed.");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding rooms:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
