// src/services/tournament/matchmaking.service.ts

import { prisma } from "@/components/prisma";
import { TournamentType, TournamentQueueState } from "@prisma/client";
import { TournamentService } from "./tournament";

interface MatchmakingConfig {
  initialRange: number;
  rangeStep: number;
  rangeInterval: number; // ms
  maxRange: number;
  botFallbackDelay: number; // ms
  botMMRMin: number;
  botMMRMax: number;
}

const CONFIGS: Record<TournamentType, MatchmakingConfig> = {
  WEEKLY: {
    initialRange: 100,
    rangeStep: 50,
    rangeInterval: 3000,
    maxRange: 500,
    botFallbackDelay: 12000,
    botMMRMin: 800,
    botMMRMax: 1800,
  },
  MONTHLY: {
    initialRange: 50,
    rangeStep: 30,
    rangeInterval: 4000,
    maxRange: 300,
    botFallbackDelay: 18000,
    botMMRMin: 800,
    botMMRMax: 1800,
  },
};

export class TournamentMatchmaking {
  private queues: Map<TournamentType, Set<number>> = new Map();
  private tournamentService: TournamentService;

  constructor(tournamentService: TournamentService) {
    this.tournamentService = tournamentService;
  }

  // ---------- ورود به صف ----------
  async enqueue(
    playerId: number,
    seasonId: number,
    type: TournamentType,
  ): Promise<void> {
    // ۱. بررسی بلیط (برای ماهانه)
    if (type === "MONTHLY") {
      const ticket = await prisma.userTicket.findUnique({
        where: { userId: playerId },
      });
      if (!ticket || ticket.balance < 1) {
        throw new Error("Insufficient tickets for Monthly tournament");
      }
    }

    // ۲. ثبت در دیتابیس (برای persistence)
    await prisma.tournamentQueueEntry.create({
      data: {
        playerId,
        seasonId,
        state: "IN_QUEUE",
        enqueuedAt: new Date(),
      },
    });

    // ۳. اضافه به صف در حافظه
    if (!this.queues.has(type)) this.queues.set(type, new Set());
    this.queues.get(type)!.add(playerId);

    // ۴. شروع جستجو (غیرهمگام)
    this.startSearch(playerId, seasonId, type);
  }

  // ---------- جستجوی حریف ----------
  private async startSearch(
    playerId: number,
    seasonId: number,
    type: TournamentType,
  ): Promise<void> {
    const config = CONFIGS[type];
    let range = config.initialRange;
    const startTime = Date.now();

    const mmr = await this.tournamentService.getTournamentMMR(
      playerId,
      seasonId,
    );

    while (true) {
      // بررسی خروج از صف
      if (!this.queues.get(type)?.has(playerId)) {
        await this.cancelQueueEntry(playerId, seasonId);
        return;
      }

      const candidates = await this.findCandidates(
        playerId,
        mmr,
        range,
        type,
        seasonId,
      );
      if (candidates.length > 0) {
        // انتخاب نزدیک‌ترین MMR
        const opponent = candidates.sort(
          (a, b) => Math.abs(a.mmr - mmr) - Math.abs(b.mmr - mmr),
        )[0];
        await this.createMatch(playerId, opponent.id, seasonId, type);
        return;
      }

      // گسترش بازه
      await this.sleep(config.rangeInterval);
      range = Math.min(range + config.rangeStep, config.maxRange);

      // اگر زمان Bot Fallback رسید
      if (Date.now() - startTime > config.botFallbackDelay) {
        await this.createBotMatch(playerId, seasonId, type);
        return;
      }
    }
  }

  // ---------- پیدا کردن کاندیداها ----------
  private async findCandidates(
    playerId: number,
    mmr: number,
    range: number,
    type: TournamentType,
    seasonId: number,
  ): Promise<{ id: number; mmr: number }[]> {
    const queue = this.queues.get(type) || new Set();
    const result: { id: number; mmr: number }[] = [];

    for (const pid of queue) {
      if (pid === playerId) continue;
      const oppMMR = await this.tournamentService.getTournamentMMR(
        pid,
        seasonId,
      );
      if (Math.abs(oppMMR - mmr) <= range) {
        result.push({ id: pid, mmr: oppMMR });
      }
    }
    return result;
  }

  // ---------- ایجاد مسابقه (بازی تخته‌نرد) ----------
  private async createMatch(
    playerA: number,
    playerB: number,
    seasonId: number,
    type: TournamentType,
  ): Promise<void> {
    // حذف از صف حافظه
    this.queues.get(type)?.delete(playerA);
    this.queues.get(type)?.delete(playerB);

    // بروزرسانی وضعیت در دیتابیس
    await prisma.tournamentQueueEntry.updateMany({
      where: {
        playerId: { in: [playerA, playerB] },
        seasonId,
        state: "IN_QUEUE",
      },
      data: { state: "MATCH_FOUND", matchedAt: new Date() },
    });

    // ایجاد بازی تخته‌نرد
    const game = await prisma.games.create({
      data: {
        status: "PENDING",
        whitePlayerId: playerA,
        blackPlayerId: playerB,
      },
    });

    // ذخیره gameId در صف
    await prisma.tournamentQueueEntry.updateMany({
      where: {
        playerId: { in: [playerA, playerB] },
        seasonId,
        state: "MATCH_FOUND",
      },
      data: { gameId: game.id, state: "IN_GAME" },
    });

    // ارسال نوتیفیکیشن به بازیکنان (از طریق WebSocket)
    // این بخش باید از طریق سیستم پیام‌رسانی انجام شود
    console.log(
      `[Matchmaking] Match created: game ${game.id} between ${playerA} and ${playerB}`,
    );
  }

  // ---------- ساخت بات ----------
  private async createBotMatch(
    playerId: number,
    seasonId: number,
    type: TournamentType,
  ): Promise<void> {
    const mmr = await this.tournamentService.getTournamentMMR(
      playerId,
      seasonId,
    );
    const botMMR = Math.min(
      Math.max(mmr + (Math.random() * 150 - 75), 800),
      1800,
    );

    // حذف از صف
    this.queues.get(type)?.delete(playerId);
    await prisma.tournamentQueueEntry.updateMany({
      where: { playerId, seasonId, state: "IN_QUEUE" },
      data: { state: "MATCH_FOUND", matchedAt: new Date() },
    });

    // ایجاد بازی با بات (شناسه کاربری ثابت برای بات، مثلاً 0)
    const botUserId = 0; // کاربر بات
    const game = await prisma.games.create({
      data: {
        status: "PENDING",
        whitePlayerId: playerId,
        blackPlayerId: botUserId,
      },
    });

    // ذخیره gameId
    await prisma.tournamentQueueEntry.updateMany({
      where: { playerId, seasonId, state: "MATCH_FOUND" },
      data: { gameId: game.id, state: "IN_GAME" },
    });

    console.log(
      `[Matchmaking] Bot match created: game ${game.id} for player ${playerId}`,
    );
  }

  // ---------- لغو صف ----------
  async cancelQueue(
    playerId: number,
    seasonId: number,
    type: TournamentType,
  ): Promise<void> {
    this.queues.get(type)?.delete(playerId);
    await this.cancelQueueEntry(playerId, seasonId);
  }

  private async cancelQueueEntry(
    playerId: number,
    seasonId: number,
  ): Promise<void> {
    await prisma.tournamentQueueEntry.updateMany({
      where: { playerId, seasonId, state: "IN_QUEUE" },
      data: { state: "REJECTED" },
    });
  }

  // ---------- بروزرسانی Elo بعد از پایان بازی ----------
  async onGameFinished(
    gameId: number,
    winnerId: number,
    loserId: number,
    seasonId: number,
  ): Promise<void> {
    await this.tournamentService.updateTournamentMMR(
      winnerId,
      loserId,
      seasonId,
    );

    // بروزرسانی وضعیت صف
    await prisma.tournamentQueueEntry.updateMany({
      where: { gameId, state: "IN_GAME" },
      data: { state: "COMPLETED" },
    });
  }

  // ---------- ابزار ----------
  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
