import { getAllActiveGames, saveGame, deleteGame } from "../gameStore";
import { appendGameEvent, loadGameState } from "../eventStore";
import { RoomManager } from "../../socket/room-manager";
import { onOkSocketResponse } from "@/responses/response-builder";

export async function checkGameTimeouts(rooms: RoomManager) {
  const games = getAllActiveGames();
  const now = Date.now();

  for (const game of games) {
    if (game.status !== "in-progress" && game.status !== "starting") continue;

    const gameIdNum = Number(game.id);

    // ۱. چک کردن تایم‌اوت نوبت (Turn Timeout - مثلا ۳۰ ثانیه)
    if (game.turn && game.turnStartedAt) {
      const turnDuration = now - game.turnStartedAt;
      if (turnDuration > 30000) {
        // ۳۰ ثانیه
        await handleTimeout(gameIdNum, "TURN_TIMEOUT", game.turn, rooms);
        continue; // بقیه چک‌ها برای این بازی لازم نیست
      }
    }

    // ۲. چک کردن تایم‌اوت شبکه (Network/Disconnect Timeout - مثلا ۶۰ ثانیه)
    if (game.lastActionAt) {
      const inactiveDuration = now - game.lastActionAt;
      if (inactiveDuration > 60000) {
        // ۶۰ ثانیه
        // فرض می‌کنیم کسی که نوبتش بوده مسئول توقف بازیه
        await handleTimeout(
          gameIdNum,
          "NETWORK_TIMEOUT",
          game.turn || game.players[0].id,
          rooms,
        );
      }
    }
  }
}

async function handleTimeout(
  gameId: number,
  type: "TURN_TIMEOUT" | "NETWORK_TIMEOUT",
  loserId: string,
  rooms: RoomManager,
) {
  console.log(`[Timer] Handling ${type} for game ${gameId}, Loser: ${loserId}`);

  // پیدا کردن برنده (نفر مقابل بازنده)
  const state = await loadGameState(gameId);
  if (!state) return;

  const winner = state.players.find((p) => p.id !== loserId);
  if (!winner) return;

  // ثبت واقعه پایان بازی در EventStore
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

  // بازسازی استیت نهایی و ذخیره
  const finalGame = await loadGameState(gameId);
  if (finalGame) {
    saveGame(finalGame);

    // اطلاع‌رسانی به کلاینت‌ها
    rooms.broadcast(String(gameId), {
      type: "game.result",
      payload: {
        winner: winner.id,
        reason: type === "TURN_TIMEOUT" ? "timeout" : "disconnect",
      },
    });

    rooms.broadcast(String(gameId), {
      type: "game.state",
      payload: onOkSocketResponse(finalGame, `Game ended due to ${type}`),
    });
  }
}
