// src/game/bot/config.ts
import { RoomType } from "@prisma/client";

// نگاشت streak به σ_skill (طبق جدول)
export function getSigmaSkill(streak: number): number {
  if (streak <= -3) return 2.0;
  if (streak <= -1) return 1.2;
  if (streak <= 1) return 0.7;
  if (streak <= 3) return 0.4;
  return 0.1;
}

// δ_room (بایاس اقتصادی) — فعلاً ثابت، بعداً از دیتابیس یا cron
const ROOM_DELTA: Record<RoomType, number> = {
  ROOM1: -0.3,
  ROOM2: -0.1,
  ROOM3: 0.0,
  ROOM4: 0.1,
  ROOM5: 0.2,
  ROOM6: 0.3,
  ROOM7: 0.4,
  ROOM8: 0.5,
  ROOM9: 0.5,
};

export function getSigmaFinal(
  roomType: RoomType,
  playerStreak: number,
): number {
  const skill = getSigmaSkill(playerStreak);
  const delta = ROOM_DELTA[roomType] || 0;
  return Math.min(Math.max(skill + delta, 0.01), 2.5);
}

// Shadow MMR برای مچ‌میکینگ (طبق بخش ۱۲ داکیومنت)
export function getBotShadowMmr(playerMmr: number, streak: number): number {
  let offset = 0;
  if (streak <= -3) offset = -80;
  else if (streak <= -1) offset = -40;
  else if (streak <= 1) offset = 0;
  else if (streak <= 3) offset = 40;
  else offset = 80;
  return Math.max(800, Math.min(1800, playerMmr + offset));
}
