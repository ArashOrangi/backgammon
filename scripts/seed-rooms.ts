// scripts/seed-rooms.ts
// ============================================================
// این فایل برای مقداردهی اولیه RoomPreset ها استفاده می‌شود
// اتاق‌ها: ROOM1 تا ROOM9 (طبق مستندات)
// ============================================================

import { prisma } from "../src/components/prisma";
import { RoomType } from "@prisma/client";

async function main() {
  console.log("🌱 Seeding RoomPreset data...");

  const rooms = [
    {
      id: 1,
      roomType: RoomType.ROOM1,
      minXp: 1,
      coinBuyIn: 100,
      coinReward: 180,
      timer: 1,
      doublingCube: false,
      undo: 1,
      rewardXp: 0,
      leaderboardPoint: 0,
      baseWinXP: 14,
      baseLoseXP: 10,
      spread: 4,
      bonusCap: 4,
    },
    {
      id: 2,
      roomType: RoomType.ROOM2,
      minXp: 3,
      coinBuyIn: 500,
      coinReward: 900,
      timer: 1,
      doublingCube: true,
      undo: 1,
      rewardXp: 0,
      leaderboardPoint: 0,
      baseWinXP: 16,
      baseLoseXP: 13,
      spread: 6,
      bonusCap: 6,
    },
    {
      id: 3,
      roomType: RoomType.ROOM3,
      minXp: 6,
      coinBuyIn: 2000,
      coinReward: 3600,
      timer: 1,
      doublingCube: true,
      undo: 1,
      rewardXp: 0,
      leaderboardPoint: 0,
      baseWinXP: 19,
      baseLoseXP: 15,
      spread: 8,
      bonusCap: 8,
    },
    {
      id: 4,
      roomType: RoomType.ROOM4,
      minXp: 11,
      coinBuyIn: 8000,
      coinReward: 14400,
      timer: 1,
      doublingCube: true,
      undo: 1,
      rewardXp: 0,
      leaderboardPoint: 0,
      baseWinXP: 22,
      baseLoseXP: 18,
      spread: 8,
      bonusCap: 8,
    },
    {
      id: 5,
      roomType: RoomType.ROOM5,
      minXp: 17,
      coinBuyIn: 30000,
      coinReward: 54000,
      timer: 1,
      doublingCube: true,
      undo: 1,
      rewardXp: 0,
      leaderboardPoint: 0,
      baseWinXP: 25,
      baseLoseXP: 21,
      spread: 8,
      bonusCap: 8,
    },
    {
      id: 6,
      roomType: RoomType.ROOM6,
      minXp: 23,
      coinBuyIn: 100000,
      coinReward: 180000,
      timer: 1,
      doublingCube: true,
      undo: 1,
      rewardXp: 0,
      leaderboardPoint: 0,
      baseWinXP: 28,
      baseLoseXP: 24,
      spread: 8,
      bonusCap: 8,
    },
    {
      id: 7,
      roomType: RoomType.ROOM7,
      minXp: 29,
      coinBuyIn: 350000,
      coinReward: 630000,
      timer: 1,
      doublingCube: true,
      undo: 1,
      rewardXp: 0,
      leaderboardPoint: 0,
      baseWinXP: 32,
      baseLoseXP: 28,
      spread: 8,
      bonusCap: 8,
    },
    {
      id: 8,
      roomType: RoomType.ROOM8,
      minXp: 35,
      coinBuyIn: 1200000,
      coinReward: 2160000,
      timer: 1,
      doublingCube: true,
      undo: 1,
      rewardXp: 0,
      leaderboardPoint: 0,
      baseWinXP: 36,
      baseLoseXP: 32,
      spread: 8,
      bonusCap: 8,
    },
    {
      id: 9,
      roomType: RoomType.ROOM9,
      minXp: 41,
      coinBuyIn: 4000000,
      coinReward: 7200000,
      timer: 1,
      doublingCube: true,
      undo: 1,
      rewardXp: 0,
      leaderboardPoint: 0,
      baseWinXP: 40,
      baseLoseXP: 36,
      spread: 8,
      bonusCap: 8,
    },
  ];

  for (const room of rooms) {
    // جدا کردن id برای استفاده در create (چون autoincrement است)
    const { id, ...createData } = room;

    await prisma.roomPreset.upsert({
      where: { id },
      update: room, // برای بروزرسانی، کل شیء (با id) ارسال می‌شود
      create: createData, // برای ایجاد، id حذف شده است
    });

    console.log(`✅ RoomPreset ${room.id} (${room.roomType}) upserted.`);
  }

  console.log("🌱 Seeding RoomPreset completed.");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding rooms:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
