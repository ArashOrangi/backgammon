import { getAllActiveGames, saveGame } from "../gameStore";
import { appendGameEvent, loadGameState } from "../eventStore";
import { RoomManager } from "../../socket/room-manager";
import { onOkSocketResponse } from "@/responses/response-builder";

// وضعیت هشدار برای هر بازی (برای جلوگیری از ارسال مکرر)
const warningState = new Map<number, { level: "none" | "5s" }>();

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

// ریست وضعیت هشدار
export function resetWarningState(gameId: number) {
  warningState.set(gameId, { level: "none" });
}

// ارسال رویداد شروع تایمر با secondaryTotal و secondaryRemaining
export function broadcastTimerStarted(
  gameId: number,
  playerId: number,
  primaryTime: number,
  secondaryTotal: number,
  secondaryRemaining: number,
  turnStartedAt: number,
  rooms: RoomManager,
) {
  rooms.broadcast(gameId, {
    type: "timer.started",
    payload: onOkSocketResponse({
      playerId,
      primaryTime,
      secondaryTotal,
      secondaryRemaining,
      turnStartedAt,
    }),
  });
}

// مدیریت تایم‌اوت
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

  await appendGameEvent(gameId, {
    type: type === "TURN_TIMEOUT" ? "TURN_TIMEOUT" : "NETWORK_TIMEOUT",
    payload: { playerId: loserId },
  });

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

  warningState.delete(gameId);
}
