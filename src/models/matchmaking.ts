// models/matchmaking.ts
import { prisma } from "@/components/prisma";
import { appendGameEvent, forceSnapshot } from "@/game/eventStore";
import { getDefaultTimerPreset } from "./timerPreset";
import { OrmState } from "./enums";
import { BOT_USER_ID } from "@/static/statics";
import type { GameState } from "@/game/types";
import { RoomType } from "@prisma/client";
import { RoomManager } from "@/socket/room-manager";
import { notifyUserGameReady } from "@/socket/handlers/join";
import { prismaGameCreate } from "./game";

export interface RoomConfig {
  id: RoomType;
  name: string;
  initialRange: number; // ±
  maxRange: number; // ±
  botTimeoutSeconds: number;
}

export const ROOM_CONFIGS: Record<RoomType, RoomConfig> = {
  [RoomType.ROOM1]: {
    id: RoomType.ROOM1,
    name: "Room 1",
    initialRange: 150,
    maxRange: 300,
    botTimeoutSeconds: 6,
  },
  [RoomType.ROOM2]: {
    id: RoomType.ROOM2,
    name: "Room 2",
    initialRange: 140,
    maxRange: 280,
    botTimeoutSeconds: 7,
  },
  [RoomType.ROOM3]: {
    id: RoomType.ROOM3,
    name: "Room 3",
    initialRange: 130,
    maxRange: 260,
    botTimeoutSeconds: 8,
  },
  [RoomType.ROOM4]: {
    id: RoomType.ROOM4,
    name: "Room 4",
    initialRange: 120,
    maxRange: 250,
    botTimeoutSeconds: 9,
  },
  [RoomType.ROOM5]: {
    id: RoomType.ROOM5,
    name: "Room 5",
    initialRange: 100,
    maxRange: 220,
    botTimeoutSeconds: 10,
  },
  [RoomType.ROOM6]: {
    id: RoomType.ROOM6,
    name: "Room 6",
    initialRange: 90,
    maxRange: 200,
    botTimeoutSeconds: 11,
  },
  [RoomType.ROOM7]: {
    id: RoomType.ROOM7,
    name: "Room 7",
    initialRange: 80,
    maxRange: 180,
    botTimeoutSeconds: 12,
  },
  [RoomType.ROOM8]: {
    id: RoomType.ROOM8,
    name: "Room 8",
    initialRange: 70,
    maxRange: 160,
    botTimeoutSeconds: 13,
  },
  [RoomType.ROOM9]: {
    id: RoomType.ROOM9,
    name: "Room 9",
    initialRange: 60,
    maxRange: 140,
    botTimeoutSeconds: 14,
  },
};

// -------------------- ساختار بازیکن در صف --------------------
interface QueuedPlayer {
  userId: number;
  queueEnterTime: number; // timestamp ms
  room: RoomType;
}

// صف‌های جداگانه برای هر اتاق (در حافظه)
const queues = new Map<RoomType, QueuedPlayer[]>();

// -------------------- توابع کمکی داخلی --------------------

/** محاسبه محدوده مجاز MMR بر اساس زمان انتظار (طبق PDF) */
function getAllowedRange(queued: QueuedPlayer, config: RoomConfig): number {
  const waitSeconds = (Date.now() - queued.queueEnterTime) / 1000;
  const range = config.initialRange + Math.floor(waitSeconds / 3) * 50;
  return Math.min(range, config.maxRange);
}

/** بررسی قوانین جلوگیری از تکرار حریف (PDF: حداکثر 2 بازی پشت سر هم و حداکثر 3 بازی در 3۰ دقیقه) */
function canMatchAgain(
  playerId: number,
  opponentId: number,
  recentOpponents: any[],
): boolean {
  // قانون 1: دو بازی پشت سر هم با یک حریف ممنوع
  const lastOpponent = recentOpponents[recentOpponents.length - 1]?.opponentId;
  if (lastOpponent === opponentId) return false;

  // قانون 2: حداکثر 3 بازی در 3۰ دقیقه
  const now = Date.now();
  const matchesInLast30min = recentOpponents.filter(
    (entry: any) =>
      entry.opponentId === opponentId && now - entry.timestamp < 30 * 60 * 1000,
  ).length;
  if (matchesInLast30min >= 3) return false;

  return true;
}

/** اعمال قوانین Streak (طبق PDF) */
function isStreakValid(player: any, opponent: any): boolean {
  // Loss Streak قوانین
  if (player.lossStreak === 3) {
    if (opponent.mmr > player.mmr + 100) return false;
  }
  if (player.lossStreak === 4) {
    if (opponent.mmr > player.mmr + 50) return false;
  }
  if (player.lossStreak >= 5) {
    if (opponent.mmr > player.mmr) return false;
  }

  // Win Streak قوانین
  if (player.winStreak >= 4 && player.winStreak <= 5) {
    if (opponent.mmr < player.mmr - 100) return false;
  }
  if (player.winStreak >= 6) {
    if (opponent.mmr < player.mmr - 50) return false;
  }
  return true;
}

/** اولویت نرم Win Rate (طبق PDF) */
function getWinRatePreference(player: any, opponent: any): number {
  const wins = (player.recentResults as boolean[]).filter(
    (r) => r === true,
  ).length;
  const winRate = wins / 20;
  if (winRate > 0.6) {
    // ترجیح حریف با MMR >= خودش
    return opponent.mmr >= player.mmr ? 0 : 1;
  }
  if (winRate < 0.4) {
    // ترجیح حریف با MMR <= خودش
    return opponent.mmr <= player.mmr ? 0 : 1;
  }
  return 0;
}

/** جستجوی بهترین حریف در صف یک اتاق (طبق فرآیند انتخاب PDF) */
async function findOpponent(
  queuedPlayer: QueuedPlayer,
  config: RoomConfig,
): Promise<QueuedPlayer | null> {
  const queue = queues.get(queuedPlayer.room) || [];
  const currentPlayer = await prisma.user.findUnique({
    where: { id: queuedPlayer.userId },
  });
  if (!currentPlayer) return null;

  const allowedRange = getAllowedRange(queuedPlayer, config);
  const minMmr = currentPlayer.mmr - allowedRange;
  const maxMmr = currentPlayer.mmr + allowedRange;

  // حذف خودش از لیست کاندیداها
  let candidates = queue.filter((q) => q.userId !== queuedPlayer.userId);
  if (candidates.length === 0) return null;

  const candidateIds = candidates.map((c) => c.userId);
  const candidateUsers = await prisma.user.findMany({
    where: { id: { in: candidateIds } },
  });
  const userMap = new Map(candidateUsers.map((u) => [u.id, u]));

  // مرحله 1: فیلتر MMR (بر اساس allowed_range)
  let filtered = candidates.filter((c) => {
    const u = userMap.get(c.userId);
    return u && u.mmr >= minMmr && u.mmr <= maxMmr;
  });
  if (filtered.length === 0) return null;

  // مرحله 2: جلوگیری از تکرار حریف
  const recentOpponents = (currentPlayer.recentOpponents as any[]) || [];
  filtered = filtered.filter((c) =>
    canMatchAgain(queuedPlayer.userId, c.userId, recentOpponents),
  );
  if (filtered.length === 0) return null;

  // مرحله 3: اعمال قوانین Streak
  filtered = filtered.filter((c) =>
    isStreakValid(currentPlayer, userMap.get(c.userId)!),
  );
  if (filtered.length === 0) return null;

  // مرحله ۴: اعمال ترجیح Win Rate (اولویت اول)
  filtered.sort((a, b) => {
    const oppA = userMap.get(a.userId)!;
    const oppB = userMap.get(b.userId)!;
    const prefA = getWinRatePreference(currentPlayer, oppA);
    const prefB = getWinRatePreference(currentPlayer, oppB);
    if (prefA !== prefB) return prefA - prefB;
    // مرحله ۵: نزدیک‌ترین MMR
    const diffA = Math.abs(currentPlayer.mmr - oppA.mmr);
    const diffB = Math.abs(currentPlayer.mmr - oppB.mmr);
    return diffA - diffB;
  });

  return filtered[0];
}

// ===== Mapping مقادیر واقعی برای هر RoomType بر اساس PDF =====
const ROOM_PRESET_VALUES: Record<
  RoomType,
  {
    baseWinXP: number;
    baseLoseXP: number;
    spread: number;
    bonusCap: number;
    coinBuyIn: number;
    coinReward: number;
  }
> = {
  [RoomType.ROOM1]: {
    baseWinXP: 10,
    baseLoseXP: 5,
    spread: 5,
    bonusCap: 4,
    coinBuyIn: 0,
    coinReward: 0,
  },
  [RoomType.ROOM2]: {
    baseWinXP: 12,
    baseLoseXP: 6,
    spread: 6,
    bonusCap: 6,
    coinBuyIn: 10,
    coinReward: 20,
  },
  [RoomType.ROOM3]: {
    baseWinXP: 14,
    baseLoseXP: 7,
    spread: 7,
    bonusCap: 8,
    coinBuyIn: 25,
    coinReward: 50,
  },
  [RoomType.ROOM4]: {
    baseWinXP: 16,
    baseLoseXP: 8,
    spread: 8,
    bonusCap: 8,
    coinBuyIn: 50,
    coinReward: 100,
  },
  [RoomType.ROOM5]: {
    baseWinXP: 18,
    baseLoseXP: 9,
    spread: 9,
    bonusCap: 8,
    coinBuyIn: 100,
    coinReward: 200,
  },
  [RoomType.ROOM6]: {
    baseWinXP: 20,
    baseLoseXP: 10,
    spread: 10,
    bonusCap: 8,
    coinBuyIn: 200,
    coinReward: 400,
  },
  [RoomType.ROOM7]: {
    baseWinXP: 22,
    baseLoseXP: 11,
    spread: 11,
    bonusCap: 8,
    coinBuyIn: 400,
    coinReward: 800,
  },
  [RoomType.ROOM8]: {
    baseWinXP: 24,
    baseLoseXP: 12,
    spread: 12,
    bonusCap: 8,
    coinBuyIn: 800,
    coinReward: 1600,
  },
  [RoomType.ROOM9]: {
    baseWinXP: 26,
    baseLoseXP: 13,
    spread: 13,
    bonusCap: 8,
    coinBuyIn: 1600,
    coinReward: 3200,
  },
};

/**
 * اطمینان از وجود RoomPreset برای یک RoomType خاص
 * اگر وجود نداشت، با مقادیر واقعی از mapping ایجاد می‌کند
 */
async function ensureRoomPreset(roomType: RoomType): Promise<number> {
  let preset = await prisma.roomPreset.findUnique({
    where: { roomType },
  });

  if (!preset) {
    const values = ROOM_PRESET_VALUES[roomType];
    if (!values) {
      throw new Error(`No preset values defined for room type: ${roomType}`);
    }

    preset = await prisma.roomPreset.create({
      data: {
        roomType,
        baseWinXP: values.baseWinXP,
        baseLoseXP: values.baseLoseXP,
        spread: values.spread,
        bonusCap: values.bonusCap,
        coinBuyIn: values.coinBuyIn,
        coinReward: values.coinReward,
        timer: 0,
        doublingCube: true,
        undo: 0,
        rewardXp: 0,
        leaderboardPoint: 0,
        minXp: 0,
      },
    });
    console.log(
      `[Matchmaking] Created RoomPreset for ${roomType} with values:`,
      values,
    );
  }

  return preset.id;
}

/** ساخت بازی بین دو بازیکن (و اعمال تنظیمات تایمر) و ایجاد MatchRecord */
async function createGameBetween(
  whiteId: number,
  blackId: number,
  room: RoomType,
): Promise<number> {
  if (whiteId === blackId)
    throw new Error("Cannot create game with same player");

  // 1. ایجاد بازی در جدول Games
  const game = await prismaGameCreate(whiteId);
  if (!game || game === OrmState.Error)
    throw new Error("Failed to create game");

  await prisma.games.update({
    where: { id: game.id },
    data: { blackPlayerId: blackId },
  });

  // 2. ثبت رویدادهای JOIN
  await appendGameEvent(game.id, {
    type: "PLAYER_JOINED",
    payload: { playerId: whiteId, color: "white" },
  });
  await appendGameEvent(game.id, {
    type: "PLAYER_JOINED",
    payload: { playerId: blackId, color: "black" },
  });

  // 3. تنظیم تایمرهای پیش‌فرض در GameState
  const preset = await getDefaultTimerPreset();
  let state = await import("@/game/eventStore").then((m) =>
    m.loadGameState(game.id),
  );
  if (state) {
    state.roomType = room;
    state.doublingCubeEnabled = true;
    state.primaryTimePerTurn = preset.primarySeconds;
    state.secondaryTimeBank = {
      [whiteId]: preset.secondarySeconds,
      [blackId]: preset.secondarySeconds,
    };
    await import("@/game/gameStore").then((m) => m.saveGame(state));
    await forceSnapshot(game.id, state);
  }

  // 4. ایجاد یا پیدا کردن RoomPreset
  const roomPresetId = await ensureRoomPreset(room);

  // 5. ایجاد MatchRecord (برای اتصال به RoomPreset)
  const matchRecord = await prisma.matchRecord.create({
    data: {
      roomPresetId,
      gameId: game.id,
      startMatch: new Date(),
      // endMatch بعداً در پایان بازی به‌روز می‌شود
    },
  });

  // 6. ایجاد شرکت‌کنندگان (MatchParticipent)
  await prisma.matchParticipent.createMany({
    data: [
      {
        matchRecordId: matchRecord.id,
        playerId: whiteId,
        side: true, // سفید
        result: false, // تا پایان بازی مشخص نیست
        hits: 0,
      },
      {
        matchRecordId: matchRecord.id,
        playerId: blackId,
        side: false, // سیاه
        result: false,
        hits: 0,
      },
    ],
  });

  console.log(
    `[Matchmaking] Game ${game.id} created with MatchRecord ${matchRecord.id} for room ${room}`,
  );
  return game.id;
}

/** زمان انتظار و ساخت بات در صورت عدم پیدا شدن حریف (طبق PDF) */
function scheduleBotCheck(
  userId: number,
  room: RoomType,
  enterTime: number,
  timeoutSec: number,
  rooms?: RoomManager,
) {
  setTimeout(async () => {
    const queue = queues.get(room) || [];
    const stillInQueue = queue.some(
      (p) => p.userId === userId && p.queueEnterTime === enterTime,
    );
    if (!stillInQueue) return;

    // حذف از صف
    const updatedQueue = queue.filter((p) => p.userId !== userId);
    queues.set(room, updatedQueue);

    try {
      const botId = BOT_USER_ID;
      const gameId = await createGameBetween(userId, botId, room);
      if (!gameId) {
        console.error(
          `[Matchmaking] Failed to create bot game for user ${userId}`,
        );
        return;
      }
      if (rooms) {
        await notifyUserGameReady(userId, gameId, rooms);
      }
      console.log(
        `[Matchmaking] Bot game created: ${gameId} for user ${userId}`,
      );
    } catch (err) {
      console.error(`[Matchmaking] Bot creation error:`, err);
    }
  }, timeoutSec * 1000);
}

// -------------------- توابع عمومی --------------------

/**
 * افزودن کاربر به صف مچ‌میکینگ
 * @param userId شناسه کاربر
 * @param roomType نوع اتاق (پیش‌فرض CASUAL_1)
 * @returns 0 اگر در صف قرار گرفت، otherwise gameId حریف پیدا شده
 */
export async function addToMatchmaking(
  userId: number,
  roomType: RoomType = RoomType.ROOM1,
  rooms?: RoomManager,
): Promise<number> {
  // حذف کاربر از هر صف دیگری (در صورت وجود)
  for (const [room, q] of queues.entries()) {
    const index = q.findIndex((p) => p.userId === userId);
    if (index !== -1) q.splice(index, 1);
  }

  const config = ROOM_CONFIGS[roomType];
  const queuedPlayer: QueuedPlayer = {
    userId,
    queueEnterTime: Date.now(),
    room: roomType,
  };
  let queue = queues.get(roomType) || [];
  queue.push(queuedPlayer);
  queues.set(roomType, queue);

  // تلاش برای پیدا کردن حریف
  const opponent = await findOpponent(queuedPlayer, config);
  if (opponent) {
    // حذف هر دو از صف
    const updatedQueue = queues
      .get(roomType)!
      .filter((p) => p.userId !== userId && p.userId !== opponent.userId);
    queues.set(roomType, updatedQueue);
    const gameId = await createGameBetween(userId, opponent.userId, roomType);
    return gameId;
  }

  // در صف ماند و تایم‌اوت برای بات
  scheduleBotCheck(
    userId,
    roomType,
    queuedPlayer.queueEnterTime,
    config.botTimeoutSeconds,
    rooms,
  );
  return 0;
}

/** حذف کاربر از صف مچ‌میکینگ (در صورت خروج داوطلبانه) */
export function removeFromMatchmaking(userId: number): void {
  for (const [room, q] of queues.entries()) {
    const index = q.findIndex((p) => p.userId === userId);
    if (index !== -1) {
      q.splice(index, 1);
      if (q.length === 0) queues.delete(room);
      break;
    }
  }
}

// -------------------- بروزرسانی آمار پس از پایان بازی (طبق PDF) --------------------
export async function updatePlayerStatsAfterGame(
  winnerId: number,
  loserId: number,
  gameId?: number,
): Promise<void> {
  const winner = await prisma.user.findUnique({ where: { id: winnerId } });
  const loser = await prisma.user.findUnique({ where: { id: loserId } });
  if (!winner || !loser) return;

  // به‌روزرسانی MMR (طبق PDF: +25 برد، -25 باخت)
  const newWinnerMmr = Math.max(0, winner.mmr + 25);
  const newLoserMmr = Math.max(0, loser.mmr - 25);

  // به‌روزرسانی استریک‌ها
  const winnerWinStreak = winner.winStreak + 1;
  const winnerLossStreak = 0;
  const loserLossStreak = loser.lossStreak + 1;
  const loserWinStreak = 0;

  // به‌روزرسانی recentResults (آخرین 2۰ بازی)
  const winnerResults = (winner.recentResults as boolean[]) || [];
  winnerResults.unshift(true);
  if (winnerResults.length > 20) winnerResults.pop();
  const loserResults = (loser.recentResults as boolean[]) || [];
  loserResults.unshift(false);
  if (loserResults.length > 20) loserResults.pop();

  // به‌روزرسانی recentOpponents (حداکثر 1۰ رکورد)
  const now = Date.now();
  const winnerOpponents = (winner.recentOpponents as any[]) || [];
  winnerOpponents.unshift({ opponentId: loserId, timestamp: now });
  if (winnerOpponents.length > 10) winnerOpponents.pop();
  const loserOpponents = (loser.recentOpponents as any[]) || [];
  loserOpponents.unshift({ opponentId: winnerId, timestamp: now });
  if (loserOpponents.length > 10) loserOpponents.pop();

  await prisma.user.update({
    where: { id: winnerId },
    data: {
      mmr: newWinnerMmr,
      winStreak: winnerWinStreak,
      lossStreak: winnerLossStreak,
      recentResults: winnerResults,
      recentOpponents: winnerOpponents,
    },
  });
  await prisma.user.update({
    where: { id: loserId },
    data: {
      mmr: newLoserMmr,
      winStreak: loserWinStreak,
      lossStreak: loserLossStreak,
      recentResults: loserResults,
      recentOpponents: loserOpponents,
    },
  });
}

// -------------------- تعیین سطح سختی Bot (طبق PDF) --------------------
export function getBotDifficulty(player: any): {
  level: string;
  botMmr: number;
} {
  const lossStreak = player.lossStreak;
  const winStreak = player.winStreak;
  if (lossStreak >= 4) return { level: "Easy", botMmr: player.mmr - 80 };
  if (lossStreak >= 2 && lossStreak <= 3)
    return { level: "Normal-Easy", botMmr: player.mmr - 40 };
  if (winStreak >= 6) return { level: "Hard", botMmr: player.mmr + 80 };
  if (winStreak >= 4 && winStreak <= 5)
    return { level: "Normal-Hard", botMmr: player.mmr + 40 };
  return { level: "Normal", botMmr: player.mmr };
}
