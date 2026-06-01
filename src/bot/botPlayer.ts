import { GameState, PlayerId, SPECIAL_POSITIONS } from "@/game/types";
import {
  generateMoveSequences,
  flattenMoveSequences,
} from "@/game/moveGenerator";
import { loadGameState } from "@/game/eventStore";
import { RoomManager } from "@/socket/room-manager";

export class BotPlayer {
  private botId: PlayerId;
  private gameId: number;
  private rooms: RoomManager;
  private interval: NodeJS.Timeout | null = null;
  private lastActionTimestamp: number = 0;

  constructor(botId: PlayerId, gameId: number, rooms: RoomManager) {
    this.botId = botId;
    this.gameId = gameId;
    this.rooms = rooms;
  }

  async start() {
    this.interval = setInterval(async () => {
      const now = Date.now();
      if (now - this.lastActionTimestamp < 600) return; // جلوگیری از اجرای همزمان
      this.lastActionTimestamp = now;

      const state = await loadGameState(this.gameId);
      if (!state) return;
      if (state.status === "finished") {
        this.stop();
        return;
      }
      if (state.status !== "in-progress") return;
      if (state.turn !== this.botId) return;

      if (!state.dice || state.dice.length === 0) {
        await this.rollDice();
      } else {
        await this.makeBestMove(state);
      }
    }, 500); // هر نیم ثانیه چک کن
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async rollDice() {
    const fakeCtx = { userId: this.botId, send: () => {} } as any;
    const { handleRoll } = await import("@/socket/handlers/roll");
    await handleRoll(fakeCtx, { gameId: this.gameId }, this.rooms);
    this.lastActionTimestamp = Date.now();
  }

  // --------------------------------------------------------------
  // ارزیابی پیشرفته حرکت
  // --------------------------------------------------------------
  private evaluateMove(
    state: GameState,
    move: any,
    playerId: PlayerId,
  ): number {
    let score = 0;
    const { from, to, die, ownerId } = move;
    const targetPoint = state.board.points[to];
    const isBearOff =
      to === SPECIAL_POSITIONS.BEAR_OFF_WHITE ||
      to === SPECIAL_POSITIONS.BEAR_OFF_BLACK;
    const isBar = from === SPECIAL_POSITIONS.BAR;
    const player = state.players.find((p) => p.id === playerId)!;
    const opponent = state.players.find((p) => p.id !== playerId)!;

    // 1. خارج کردن از نوار (اورژانسی)
    if (isBar) score += 200;

    // 2. زدن مهره حریف (hit)
    if (targetPoint.owner === opponent.id && targetPoint.count === 1) {
      score += 150;
    }

    // 3. خارج کردن مهره (bear off) – اگر همه مهره‌ها در خانه انتهایی باشند
    if (isBearOff) {
      // فقط در صورتی که واقعاً مجاز به bear off باشیم (توسط validateMove قبلاً چک شده)
      score += 120;
    }

    // 4. ساخت بلوک (دو مهره یا بیشتر) – دفاع
    if (targetPoint.owner === playerId && targetPoint.count >= 2) {
      score += 40;
      // اگر بلوک متوالی با خانه‌های دیگر ایجاد کند، امتیاز اضافه
      let consecutive = 1;
      let idx = to;
      const dir = player.color === "white" ? -1 : 1;
      for (let step = 1; step <= 3; step++) {
        const nextIdx = idx + step * dir;
        if (
          nextIdx >= 0 &&
          nextIdx < 24 &&
          state.board.points[nextIdx].owner === playerId &&
          state.board.points[nextIdx].count >= 2
        ) {
          consecutive++;
        } else break;
      }
      score += consecutive * 10;
    }

    // 5. پیشرفت به سمت خانه انتهایی
    const homeStart = player.color === "white" ? 18 : 0;
    const homeEnd = player.color === "white" ? 23 : 5;
    let progress = 0;
    if (to >= homeStart && to <= homeEnd) {
      progress =
        player.color === "white" ? to - homeStart + 1 : homeEnd - to + 1;
      score += progress * 3;
    } else {
      // اگر هنور دور است، هر چه به خانه نزدیک‌تر باشد بهتر
      const distanceToHome =
        player.color === "white" ? homeStart - to : to - homeEnd;
      if (distanceToHome > 0) score += (24 - distanceToHome) / 2;
    }

    // 6. جلوگیری از تنها ماندن مهره (ریسک hit شدن) – جریمه
    if (
      targetPoint.owner === playerId &&
      targetPoint.count === 1 &&
      !isBearOff &&
      !isBar
    ) {
      // آیا حریف در برد 6 خانه می‌تواند به این خانه برسد؟ (ساده)
      const opponentHome = opponent.color === "white" ? [0, 5] : [18, 23];
      const canBeHit = player.color === "white" ? to <= 5 : to >= 18;
      if (canBeHit) score -= 20;
    }

    // 7. مصرف تاس دابل (اگر دابل باشد، حرکات تکراری ارزش بیشتری دارند)
    if (
      state.dice &&
      state.dice.length === 4 &&
      state.dice[0] === state.dice[1]
    ) {
      score += 25; // اولویت استفاده از دابل
    }

    // 8. اگر حرکت باعث شود مهره از روی نوار وارد خانه‌ای شود که در معرض خطر است (تک مهره) – جریمه
    if (isBar && targetPoint.owner === playerId && targetPoint.count === 1) {
      score -= 15;
    }

    return score;
  }

  private async makeBestMove(state: GameState) {
    const moves = generateMoveSequences(state, this.botId);
    const flatMoves = flattenMoveSequences(moves);
    if (flatMoves.length === 0) {
      await this.endTurn();
      return;
    }

    // انتخاب بهترین حرکت (بیشترین امتیاز)
    let bestMove = flatMoves[0];
    let bestScore = this.evaluateMove(state, bestMove, this.botId);
    for (let i = 1; i < flatMoves.length; i++) {
      const score = this.evaluateMove(state, flatMoves[i], this.botId);
      if (score > bestScore) {
        bestScore = score;
        bestMove = flatMoves[i];
      }
    }

    const payload = {
      gameId: this.gameId,
      from: bestMove.from,
      to: bestMove.to,
      die: bestMove.die,
    };
    const fakeCtx = { userId: this.botId, send: () => {} } as any;
    const { handleMove } = await import("@/socket/handlers/move");
    await handleMove(fakeCtx, [payload], this.rooms);
    this.lastActionTimestamp = Date.now();
  }

  private async endTurn() {
    const fakeCtx = { userId: this.botId, send: () => {} } as any;
    const { handleEndTurn } = await import("@/socket/handlers/endTurn");
    await handleEndTurn(fakeCtx, { gameId: this.gameId }, this.rooms);
    this.lastActionTimestamp = Date.now();
  }
}
