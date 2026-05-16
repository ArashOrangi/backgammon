import { appendGameEvent, loadGameState } from "../../game/eventStore";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import { saveGame } from "@/game/gameStore";

type JoinPayload = {
  gameId: string;
};

export async function handleJoin(
  ctx: SocketContext,
  payload: JoinPayload,
  rooms: RoomManager,
) {
  const { gameId } = payload;
  const numericGameId = Number(gameId); // یکبار تبدیل برای تمیزی کد
  const playerId = ctx.id;

  try {
    // ۱. مستقیم از EventStore لود کن (تضمین بالاترین دقت)
    let state = await loadGameState(numericGameId);

    if (!state) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Game not found"),
      });
    }

    const alreadyInGame = state.players.some((p) => p.id === playerId);

    if (!alreadyInGame) {
      // ۲. چک کردن ظرفیت بر اساس آخرین وضعیت واقعی
      if (state.players.length >= 2) {
        return ctx.send({
          type: "game.error",
          payload: onErrorSocketResponse("Game is full"),
        });
      }

      const color = state.players.length === 0 ? "white" : "black";

      // ۳. ثبت رویداد Join
      await appendGameEvent(numericGameId, {
        type: "PLAYER_JOINED",
        payload: { playerId, color },
      });

      // ۴. بازسازی استیت برای مرحله بعد
      state = await loadGameState(numericGameId);

      // ۵. اگر دو نفر کامل شدند، فاز Starting رو استارت بزن
      // نکته: state! تضمین شده است چون همین الان آپدیتش کردیم
      if (state!.players.length === 2 && state!.status === "waiting") {
        await appendGameEvent(numericGameId, {
          type: "GAME_STARTING",
          payload: {},
        });

        // لود نهایی برای Broadcast
        state = await loadGameState(numericGameId);
      }

      // ۶. آپدیت کردن Cache حافظه (In-memory Store)
      if (state) saveGame(state);
    }

    // ۷. مدیریت اتاق‌ها و اطلاع‌رسانی
    rooms.join(gameId, ctx, "player");

    // به همه بگو کی اومد
    rooms.broadcast(gameId, {
      type: "game.join",
      payload: onOkSocketResponse({ playerId }, "Player joined"),
    });

    // آخرین وضعیت بازی رو برای همه بفرست (Full State Sync)
    rooms.broadcast(gameId, {
      type: "game.state",
      payload: onOkSocketResponse(state),
    });
  } catch (err) {
    console.error("Join Error:", err);
    const message = err instanceof Error ? err.message : "Failed to join game";

    ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(message),
    });
  }
}
