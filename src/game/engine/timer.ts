import { getAllActiveGames, saveGame } from "../gameStore";
import { appendGameEvent, loadGameState } from "../eventStore";
import { RoomManager } from "../../socket/room-manager";
import { onOkSocketResponse } from "@/responses/response-builder";

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

    // اگر زمان کل مصرف‌شده از مجموع مجاز بیشتر شد → تایم‌اوت
    if (elapsed > totalAllowed) {
      await handleTimeout(game.id, "TURN_TIMEOUT", currentPlayer, rooms);
    }
    // در غیر این صورت، هیچ کاری انجام نده (وضعیت را تغییر نده)
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
