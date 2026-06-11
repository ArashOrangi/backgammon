import { prismaGameCreate } from "./game";
import { OrmState } from "./enums";
import {
  appendGameEvent,
  loadGameState,
  forceSnapshot,
} from "@/game/eventStore"; // حذف rebuildGameStateFromScratch
import { saveGame } from "@/game/gameStore";
import { getDefaultTimerPreset } from "./timerPreset";
import { prisma } from "@/components/prisma";

const waitingPlayers: number[] = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function addToMatchmaking(userId: number): Promise<number> {
  waitingPlayers.push(userId);
  console.log(`[Matchmaking] waitingPlayers: ${waitingPlayers}`);

  if (waitingPlayers.length >= 2) {
    const whiteId = waitingPlayers.shift()!;
    const blackId = waitingPlayers.shift()!;
    console.log(`[Matchmaking] Pairing white=${whiteId}, black=${blackId}`);

    // بررسی یکسان نبودن بازیکنان
    if (whiteId === blackId) {
      console.error(
        `[Matchmaking] whiteId equals blackId (${whiteId}), cannot create game`,
      );
      return 0;
    }

    const game = await prismaGameCreate(whiteId);
    if (!game || game === OrmState.Error) {
      console.error("[Matchmaking] Failed to create game");
      throw new Error("Failed to create game");
    }
    console.log(`[Matchmaking] Game created with id=${game.id}`);

    await prisma.games.update({
      where: { id: game.id },
      data: { blackPlayerId: blackId },
    });

    await appendGameEvent(game.id, {
      type: "PLAYER_JOINED",
      payload: { playerId: whiteId, color: "white" },
    });
    await appendGameEvent(game.id, {
      type: "PLAYER_JOINED",
      payload: { playerId: blackId, color: "black" },
    });

    // ✅ منتظر بمان تا state کامل شود (حداکثر ۱ ثانیه)
    let state = null;
    for (let i = 0; i < 5; i++) {
      await sleep(200);
      state = await loadGameState(game.id);
      if (state && state.players.length === 2) break;
    }

    if (!state || state.players.length !== 2) {
      console.error(
        `[Matchmaking] Failed to get full state for game ${game.id} after retries`,
      );
      // پاک کردن بازی خراب
      await prisma.gameEvents
        .deleteMany({ where: { gameId: game.id } })
        .catch(() => {});
      await prisma.gameSnapshots
        .deleteMany({ where: { gameId: game.id } })
        .catch(() => {});
      await prisma.games.delete({ where: { id: game.id } }).catch(() => {});
      return 0;
    }

    // تنظیم تایمر و ذخیره
    const preset = await getDefaultTimerPreset();
    state.primaryTimePerTurn = preset.primarySeconds;
    state.secondaryTimeBank = {
      [whiteId]: preset.secondarySeconds,
      [blackId]: preset.secondarySeconds,
    };

    saveGame(state);
    await forceSnapshot(game.id, state);

    return game.id;
  }
  return 0;
}
