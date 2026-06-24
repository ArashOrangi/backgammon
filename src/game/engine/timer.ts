import { getAllActiveGames, saveGame } from "../gameStore";
import { appendGameEvent, loadGameState } from "../eventStore";
import { RoomManager } from "../../socket/room-manager";
import { onOkSocketResponse } from "@/responses/response-builder";

// وضعیت هشدار برای هر بازی (برای جلوگیری از ارسال مکرر)
const warningState = new Map<number, { level: "none" | "5s" }>();

/**
 * تابع اصلی بررسی تایم‌اوت‌ها
 * این تابع هر TICK (مثلاً هر ۲ ثانیه) توسط سرور فراخوانی می‌شود
 */
export async function checkGameTimeouts(rooms: RoomManager) {
  const games = getAllActiveGames();
  const now = Date.now();

  for (const game of games) {
    if (game.status !== "in-progress") continue;

    const currentPlayer = game.turn;
    if (!currentPlayer) continue;

    const turnStarted = game.turnStartedAt ?? now;
    const elapsed = (now - turnStarted) / 1000;
    const primary = game.primaryTimePerTurn;
    const secondary = game.secondaryTimeBank[currentPlayer] ?? 0;
    const totalAllowed = primary + secondary;
    const remaining = totalAllowed - elapsed;

    // ۱. اگر زمان تمام شده → تایم‌اوت
    if (remaining <= 0) {
      // ارسال رویداد timer.timeout قبل از پایان بازی
      rooms.broadcast(game.id, {
        type: "timer.timeout",
        payload: onOkSocketResponse({
          playerId: currentPlayer,
          type: "TURN_TIMEOUT",
        }),
      });

      await handleTimeout(game.id, "TURN_TIMEOUT", currentPlayer, rooms);
      continue;
    }

    // ۲. ارسال هشدار ۵ ثانیه مانده (فقط یک بار)
    const state = warningState.get(game.id) || { level: "none" };
    if (remaining <= 5 && state.level !== "5s") {
      rooms.broadcast(game.id, {
        type: "timer.warning",
        payload: onOkSocketResponse({
          remaining: Math.ceil(remaining),
          playerId: currentPlayer,
        }),
      });
      warningState.set(game.id, { level: "5s" });
    }
  }
}

/**
 * تابع برای ریست وضعیت هشدار (زمانی که بازیکن حرکت می‌کند یا نوبت عوض می‌شود)
 * این تابع باید در مکان‌های زیر فراخوانی شود:
 * - بعد از هر حرکت (MOVE_APPLIED)
 * - بعد از تعویض نوبت (TURN_PASSED)
 * - بعد از شروع بازی (GAME_STARTED)
 */
export function resetWarningState(gameId: number) {
  warningState.set(gameId, { level: "none" });
}

/**
 * تابع ارسال رویداد timer.started (شروع تایمر)
 * این تابع باید در مکان‌های زیر فراخوانی شود:
 * - بعد از تعویض نوبت (در handleEndTurn و roll و ...)
 * - بعد از شروع بازی
 * - بعد از هر حرکت (زمانی که turnStartedAt به‌روز می‌شود)
 */
export function broadcastTimerStarted(
  gameId: number,
  playerId: number,
  primaryTime: number,
  secondaryTime: number,
  turnStartedAt: number,
  rooms: RoomManager,
) {
  rooms.broadcast(gameId, {
    type: "timer.started",
    payload: onOkSocketResponse({
      playerId,
      primaryTime,
      secondaryTime,
      turnStartedAt,
    }),
  });
}

/**
 * مدیریت تایم‌اوت و پایان بازی
 */
async function handleTimeout(
  gameId: number,
  type: "TURN_TIMEOUT" | "NETWORK_TIMEOUT",
  loserId: number,
  rooms: RoomManager,
) {
  console.log(`[Timer] Handling ${type} for game ${gameId}, Loser: ${loserId}`);

  const state = await loadGameState(gameId);
  if (!state) return;

  const winner = state.players.find((p) => p.id !== loserId);
  if (!winner) return;

  // ثبت رویداد تایم‌اوت
  await appendGameEvent(gameId, {
    type: type === "TURN_TIMEOUT" ? "TURN_TIMEOUT" : "NETWORK_TIMEOUT",
    payload: { playerId: loserId },
  });

  // ثبت رویداد پایان بازی
  await appendGameEvent(gameId, {
    type: "GAME_FINISHED",
    payload: {
      winner: winner.id,
      winType: "normal",
      reason: type === "TURN_TIMEOUT" ? "TIMEOUT" : "DISCONNECT",
    },
  });

  const finalGame = await loadGameState(gameId);
  if (finalGame) {
    saveGame(finalGame);

    rooms.broadcast(gameId, {
      type: "game.result",
      payload: onOkSocketResponse({
        winner: winner.id,
        reason: type === "TURN_TIMEOUT" ? "timeout" : "disconnect",
      }),
    });

    rooms.broadcast(gameId, {
      type: "game.state",
      payload: onOkSocketResponse(finalGame, `Game ended due to ${type}`),
    });
  }

  // پاک کردن وضعیت هشدار پس از پایان بازی
  warningState.delete(gameId);
}
