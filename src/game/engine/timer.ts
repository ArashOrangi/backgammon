import { getAllActiveGames, saveGame } from "../gameStore";
import { appendGameEvent, loadGameState } from "../eventStore";
import { RoomManager } from "../../socket/room-manager";
import { onOkSocketResponse } from "@/responses/response-builder";

export async function checkGameTimeouts(rooms: RoomManager) {
  const games = getAllActiveGames();
  const now = Date.now();

  for (const game of games) {
    // فقط بازی‌های در حال اجرا (in-progress) را چک می‌کنیم
    if (game.status !== "in-progress") continue;

    const gameId = game.id;
    const currentPlayer = game.turn;
    if (!currentPlayer) continue;

    // محاسبه زمان سپری شده از شروع نوبت (به ثانیه)
    const turnStarted = game.turnStartedAt ?? now;
    const elapsed = (now - turnStarted) / 1000;
    const primary = game.primaryTimePerTurn;

    if (elapsed > primary) {
      const extra = elapsed - primary;
      const bank = game.secondaryTimeBank[currentPlayer] ?? 0;

      if (extra >= bank) {
        // مخزن ثانویه تمام شده → بازیکن بازنده است
        await handleTimeout(gameId, "TURN_TIMEOUT", currentPlayer, rooms);
        continue;
      } else {
        // کسر زمان اضافی از مخزن ثانویه
        game.secondaryTimeBank[currentPlayer] = bank - extra;
        // زمان شروع نوبت را به روز می‌کنیم تا دوباره کسر نشود (اختیاری)
        game.turnStartedAt = now;
        saveGame(game);
        // می‌توانیم پیام هشدار به کلاینت بفرستیم (اختیاری)
        // rooms.broadcast(gameId, { type: "timer.warning", payload: { remaining: game.secondaryTimeBank[currentPlayer] } });
      }
    }

    // // تایم‌اوت شبکه (۶۰ ثانیه عدم فعالیت) - مستقل از تایمر نوبت
    // if (game.lastActionAt && now - game.lastActionAt > 60000) {
    //   const loserId = game.turn ?? game.players[0]?.id;
    //   if (loserId) {
    //     await handleTimeout(gameId, "NETWORK_TIMEOUT", loserId, rooms);
    //   }
    // }
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

    // پخش نتیجه برای همه
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
