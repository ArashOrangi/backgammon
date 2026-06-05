import { GameState, PlayerId, SPECIAL_POSITIONS } from "@/game/types";
import {
  generateMoveSequences,
  flattenMoveSequences,
} from "@/game/moveGenerator";
import {
  appendGameEvent,
  loadGameState,
  calculateSubStatus,
} from "@/game/eventStore";
import { RoomManager } from "@/socket/room-manager";
import { saveGame } from "@/game/gameStore";
import { onOkSocketResponse } from "@/responses/response-builder";
import { rollDice as rollDiceUtil } from "@/utils/dice";
import { validateMove } from "@/game/ruleValidator";

export class BotPlayer {
  private botId: PlayerId;
  private gameId: number;
  private rooms: RoomManager;
  private interval: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;

  constructor(botId: PlayerId, gameId: number, rooms: RoomManager) {
    this.botId = botId;
    this.gameId = gameId;
    this.rooms = rooms;
  }

  async start() {
    console.log(`[Bot ${this.botId}] Started for game ${this.gameId}`);
    // هر ۱ ثانیه یکبار چک کن (نه ۸۰۰ میلی‌ثانیه)
    this.interval = setInterval(async () => {
      if (this.isProcessing) return;
      this.isProcessing = true;
      try {
        await this.tick();
      } catch (err) {
        console.error(`[Bot ${this.botId}] Error in tick:`, err);
      } finally {
        this.isProcessing = false;
      }
    }, 1000);
  }

  private async tick() {
    // ۱. بارگذاری آخرین وضعیت از دیتابیس (event sourcing)
    const state = await loadGameState(this.gameId);
    if (!state) {
      console.log(`[Bot ${this.botId}] Game state not found`);
      return;
    }

    // ۲. اگر بازی تمام شده یا در حالت waiting/ready، کاری نکن
    if (state.status !== "in-progress") {
      if (state.status === "finished") this.stop();
      return;
    }

    // ۳. اگر نوبت بات نیست، صبر کن
    if (state.turn !== this.botId) {
      // لاگ برای دیباگ
      // console.log(`[Bot ${this.botId}] Not my turn. Turn = ${state.turn}`);
      return;
    }

    console.log(
      `[Bot ${this.botId}] It's my turn. Dice: ${state.dice?.join(",") || "empty"}`,
    );

    // ۴. اگر تاس وجود ندارد → تاس بریز
    if (!state.dice || state.dice.length === 0) {
      await this.rollDice();
      return;
    }

    // ۵. حرکات قانونی را پیدا کن
    const moveSequences = generateMoveSequences(state, this.botId);
    const flatMoves = flattenMoveSequences(moveSequences);

    if (flatMoves.length === 0) {
      console.log(`[Bot ${this.botId}] No legal moves, ending turn`);
      await this.endTurn();
      return;
    }

    // ۶. انتخاب بهترین حرکت (با استفاده از تابع موجود)
    let bestMove = flatMoves[0];
    let bestScore = this.evaluateMove(state, bestMove);
    for (let i = 1; i < flatMoves.length; i++) {
      const score = this.evaluateMove(state, flatMoves[i]);
      if (score > bestScore) {
        bestScore = score;
        bestMove = flatMoves[i];
      }
    }

    // ۷. اعتبارسنجی نهایی و ثبت حرکت
    const validation = validateMove(
      state,
      this.botId,
      bestMove.from,
      bestMove.to,
      [bestMove.die],
    );
    if (!validation.isValid) {
      console.log(
        `[Bot ${this.botId}] Move invalid: ${validation.message}. Ending turn.`,
      );
      await this.endTurn();
      return;
    }

    console.log(
      `[Bot ${this.botId}] Making move: ${bestMove.from} -> ${bestMove.to} (die ${bestMove.die})`,
    );
    await appendGameEvent(this.gameId, {
      type: "MOVE_APPLIED",
      payload: {
        playerId: this.botId,
        from: bestMove.from,
        to: bestMove.to,
        die: bestMove.die,
      },
    });

    // ۸. بعد از حرکت، دوباره وضعیت را reload می‌کنیم (خود tick بعدی می‌خواند)
    // نیازی به broadcast نیست چون سرور بعد از appendGameEvent خودش broadcast می‌کند.
    // یک تأخیر کوتاه برای اطمینان از ثبت رویداد
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  private async rollDice() {
    console.log(`[Bot ${this.botId}] Rolling dice`);
    const dice = rollDiceUtil();
    await appendGameEvent(this.gameId, {
      type: "DICE_ROLLED",
      payload: { playerId: this.botId, dice },
    });
    // صبر می‌کنیم تا رویداد ثبت شود و در tick بعدی پردازش شود
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  private async endTurn() {
    console.log(`[Bot ${this.botId}] Ending turn`);
    await appendGameEvent(this.gameId, {
      type: "TURN_PASSED",
      payload: { playerId: this.botId, reason: "MANUAL_END" },
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  private evaluateMove(state: GameState, move: any): number {
    // همان تابعی که قبلاً داشتید (می‌توانید آن را دقیقاً کپی کنید)
    let score = 0;
    const { from, to } = move;
    const targetPoint = state.board.points[to];
    const isBearOff =
      to === SPECIAL_POSITIONS.BEAR_OFF_WHITE ||
      to === SPECIAL_POSITIONS.BEAR_OFF_BLACK;
    const isBar = from === SPECIAL_POSITIONS.BAR;
    const player = state.players.find((p) => p.id === this.botId)!;
    const opponent = state.players.find((p) => p.id !== this.botId)!;

    if (isBar) score += 200;
    if (targetPoint?.owner === opponent.id && targetPoint.count === 1)
      score += 150;
    if (isBearOff) score += 120;
    if (targetPoint?.owner === player.id && targetPoint.count >= 2) {
      score += 40;
      let consecutive = 1;
      let idx = to;
      const dir = player.color === "white" ? -1 : 1;
      for (let step = 1; step <= 3; step++) {
        const nextIdx = idx + step * dir;
        if (
          nextIdx >= 0 &&
          nextIdx < 24 &&
          state.board.points[nextIdx].owner === player.id &&
          state.board.points[nextIdx].count >= 2
        ) {
          consecutive++;
        } else break;
      }
      score += consecutive * 10;
    }
    const homeStart = player.color === "white" ? 18 : 0;
    const homeEnd = player.color === "white" ? 23 : 5;
    if (to >= homeStart && to <= homeEnd) {
      const progress =
        player.color === "white" ? to - homeStart + 1 : homeEnd - to + 1;
      score += progress * 3;
    } else {
      const distanceToHome =
        player.color === "white" ? homeStart - to : to - homeEnd;
      if (distanceToHome > 0) score += (24 - distanceToHome) / 2;
    }
    if (
      targetPoint?.owner === player.id &&
      targetPoint.count === 1 &&
      !isBearOff &&
      !isBar
    ) {
      const canBeHit = player.color === "white" ? to <= 5 : to >= 18;
      if (canBeHit) score -= 20;
    }
    if (
      state.dice &&
      state.dice.length === 4 &&
      state.dice[0] === state.dice[1]
    )
      score += 25;
    if (isBar && targetPoint?.owner === player.id && targetPoint.count === 1)
      score -= 15;
    return score;
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log(`[Bot ${this.botId}] Stopped`);
    }
  }
}
