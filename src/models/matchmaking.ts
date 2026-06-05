import { prismaGameCreate } from "./game";
import { OrmState } from "./enums";
import {
  appendGameEvent,
  loadGameState,
  forceSnapshot,
} from "@/game/eventStore";
import { saveGame } from "@/game/gameStore";
import { getDefaultTimerPreset } from "./timerPreset";
import { prisma } from "@/components/prisma";

const waitingPlayers: number[] = [];

export async function addToMatchmaking(userId: number): Promise<number> {
  waitingPlayers.push(userId);
  console.log(`[Matchmaking] waitingPlayers: ${waitingPlayers}`);

  if (waitingPlayers.length >= 2) {
    const whiteId = waitingPlayers.shift()!;
    const blackId = waitingPlayers.shift()!;
    console.log(`[Matchmaking] Pairing white=${whiteId}, black=${blackId}`);

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

    // بارگذاری state و تنظیم تایمر از دیتابیس
    const state = await loadGameState(game.id);
    if (state) {
      const preset = await getDefaultTimerPreset();
      state.primaryTimePerTurn = preset.primarySeconds;
      state.secondaryTimeBank = {
        [whiteId]: preset.secondarySeconds,
        [blackId]: preset.secondarySeconds,
      };

      // ذخیره در حافظه سرور
      saveGame(state);
      // ثبت snapshot جدید با مقادیر صحیح تایمر در دیتابیس
      await forceSnapshot(game.id, state);
    }

    return game.id;
  }
  return 0;
}
