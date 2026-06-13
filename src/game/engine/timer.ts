import { getAllActiveGames, saveGame } from "../gameStore";
import { appendGameEvent, loadGameState } from "../eventStore";
import { RoomManager } from "../../socket/room-manager";
import { onOkSocketResponse } from "@/responses/response-builder";
import { updatePlayerStatsAfterGame } from "@/models/matchmaking"; // <-- اضافه شده

export async function checkGameTimeouts(rooms: RoomManager) {
  const games = getAllActiveGames();
  const now = Date.now();

  for (const game of games) {
    if (game.status !== "in-progress") continue;

    const gameId = game.id;
    const currentPlayer = game.turn;
    if (!currentPlayer) continue;

    const turnStarted = game.turnStartedAt ?? now;
    const elapsed = (now - turnStarted) / 1000;
    const primary = game.primaryTimePerTurn;

    if (elapsed > primary) {
      const extra = elapsed - primary;
      const bank = game.secondaryTimeBank[currentPlayer] ?? 0;

      if (extra >= bank) {
        await handleTimeout(gameId, "TURN_TIMEOUT", currentPlayer, rooms);
        continue;
      } else {
        game.secondaryTimeBank[currentPlayer] = bank - extra;
        game.turnStartedAt = now;
        saveGame(game);
      }
    }
  }
}

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

  // به‌روزرسانی آمار بازیکنان (MMR، استریک و تاریخچه)
  await updatePlayerStatsAfterGame(winner.id, loserId, gameId);

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
}
