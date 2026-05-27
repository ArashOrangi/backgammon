import { getAllActiveGames, saveGame } from "../gameStore";
import { appendGameEvent, loadGameState } from "../eventStore";
import { RoomManager } from "../../socket/room-manager";
import { onOkSocketResponse } from "@/responses/response-builder";

export async function checkGameTimeouts(rooms: RoomManager) {
  const games = getAllActiveGames();
  const now = Date.now();

  for (const game of games) {
    // if (game.status !== "in-progress" && game.status !== "starting") continue;
    if (game.status !== "in-progress" && game.status !== "starting") continue;
    const gameId = game.id; // number

    // 1. Turn timeout (30 seconds)
    //TODO
    // if (game.turn && game.turnStartedAt) {
    if (game.status === "in-progress" && game.turn && game.turnStartedAt) {
      const turnDuration = now - game.turnStartedAt;
      if (turnDuration > 30000) {
        await handleTimeout(gameId, "TURN_TIMEOUT", game.turn, rooms);
        continue;
      }
    }

    // 2. Network / disconnect timeout (60 seconds)
    if (game.lastActionAt) {
      const inactiveDuration = now - game.lastActionAt;
      if (inactiveDuration > 60000) {
        const loserId = game.turn ?? game.players[0]?.id;
        if (loserId !== undefined) {
          await handleTimeout(gameId, "NETWORK_TIMEOUT", loserId, rooms);
        }
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

  // Store timeout event
  await appendGameEvent(gameId, {
    type: type === "TURN_TIMEOUT" ? "TURN_TIMEOUT" : "NETWORK_TIMEOUT",
    payload: { playerId: loserId },
  });

  // Store game finished event
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

    // Broadcast result
    rooms.broadcast(gameId, {
      type: "game.result",
      payload: {
        winner: winner.id,
        reason: type === "TURN_TIMEOUT" ? "timeout" : "disconnect",
      },
    });

    rooms.broadcast(gameId, {
      type: "game.state",
      payload: onOkSocketResponse(finalGame, `Game ended due to ${type}`),
    });
  }
}
