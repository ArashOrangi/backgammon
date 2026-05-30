import { GameState, PlayerId } from "@/game/types";
import {
  generateMoveSequences,
  flattenMoveSequences,
} from "@/game/moveGenerator";
import { appendGameEvent, loadGameState } from "@/game/eventStore";
import { RoomManager } from "@/socket/room-manager";

export class BotPlayer {
  private botId: PlayerId;
  private gameId: number;
  private rooms: RoomManager;

  constructor(botId: PlayerId, gameId: number, rooms: RoomManager) {
    this.botId = botId;
    this.gameId = gameId;
    this.rooms = rooms;
  }

  async start() {
    const interval = setInterval(async () => {
      const state = await loadGameState(this.gameId);
      if (!state) return;

      // اگر بازی تمام شده، تایمر را متوقف کن
      if (state.status === "finished") {
        clearInterval(interval);
        return;
      }

      // اگر بازی در جریان نیست (مثلاً هنوز شروع نشده)، کاری نکن
      if (state.status !== "in-progress") return;

      // بررسی نوبت بات
      if (state.turn !== this.botId) return;

      if (!state.dice || state.dice.length === 0) {
        await this.rollDice();
      } else {
        await this.makeRandomMove(state);
      }
    }, 1000);
  }

  private async rollDice() {
    // شبیه‌سازی پیام game.roll از سمت بات
    // برای این کار باید یک WebSocket مجازی بسازیم یا مستقیم هندلر roll را صدا بزنیم
    // ساده‌ترین راه: ارسال درخواست به یک endpoint داخلی (HTTP) یا صدا زدن مستقیم تابع handleRoll
    // اما چون بات درون سرور اجرا می‌شود، می‌توانیم مستقیماً تابع را با یک SocketContext ساختگی صدا بزنیم.
    // فعلاً یک فانکشن ساده برای ارسال رویداد game.roll می‌سازیم.
    await this.sendRollRequest();
  }

  private async sendRollRequest() {
    // شبیه‌سازی پیام: { type: "game.roll", payload: { gameId: this.gameId } }
    // می‌توانیم از همان handleRoll استفاده کنیم با یک SocketContext ساختگی که فقط تابع send را داشته باشد (یا نادیده بگیرد)
    // برای جلوگیری از پیچیدگی، یک کلاس ساده SocketContext ساختگی می‌سازیم.
    const fakeCtx = {
      userId: this.botId,
      send: () => {},
    } as any;
    const { handleRoll } = await import("@/socket/handlers/roll");
    await handleRoll(fakeCtx, { gameId: this.gameId }, this.rooms);
  }

  private async makeRandomMove(state: GameState) {
    const moves = generateMoveSequences(state, this.botId);
    const flatMoves = flattenMoveSequences(moves);
    if (flatMoves.length === 0) {
      // هیچ حرکت قانونی نیست – نوبت را تمام کن
      await this.endTurn();
      return;
    }
    // انتخاب حرکت تصادفی
    const randomMove = flatMoves[Math.floor(Math.random() * flatMoves.length)];
    const payload = {
      gameId: this.gameId,
      from: randomMove.from,
      to: randomMove.to,
      die: randomMove.die,
    };
    const fakeCtx = { userId: this.botId, send: () => {} } as any;
    const { handleMove } = await import("@/socket/handlers/move");
    // handleMove منتظر یک آرایه از حرکات است
    await handleMove(fakeCtx, [payload], this.rooms);
  }

  private async endTurn() {
    const fakeCtx = { userId: this.botId, send: () => {} } as any;
    const { handleEndTurn } = await import("@/socket/handlers/endTurn");
    await handleEndTurn(fakeCtx, { gameId: this.gameId }, this.rooms);
  }
}
