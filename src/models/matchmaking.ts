import { prismaGameCreate } from "./game";
import { OrmState } from "./enums";
import { appendGameEvent } from "@/game/eventStore";
import { prisma } from "@/components/prisma";

const waitingPlayers: number[] = [];

export async function addToMatchmaking(userId: number): Promise<number> {
  waitingPlayers.push(userId);
  console.log(`[Matchmaking] waitingPlayers: ${waitingPlayers}`);

  if (waitingPlayers.length >= 2) {
    const whiteId = waitingPlayers.shift()!;
    const blackId = waitingPlayers.shift()!;
    console.log(`[Matchmaking] Pairing white=${whiteId}, black=${blackId}`);

    // ساخت بازی در دیتابیس
    const game = await prismaGameCreate(whiteId);
    if (!game || game === OrmState.Error) {
      console.error("[Matchmaking] Failed to create game");
      throw new Error("Failed to create game");
    }
    console.log(`[Matchmaking] Game created with id=${game.id}`);

    // به‌روزرسانی بازیکن سیاه (وضعیت ACTIVE ندهید)
    await prisma.games.update({
      where: { id: game.id },
      data: { blackPlayerId: blackId },
    });

    // ثبت ایونت PLAYER_JOINED برای سفید
    const eventWhite = await appendGameEvent(game.id, {
      type: "PLAYER_JOINED",
      payload: { playerId: whiteId, color: "white" },
    });
    console.log(`[Matchmaking] Event white: ${JSON.stringify(eventWhite)}`);

    // ثبت ایونت PLAYER_JOINED برای سیاه
    const eventBlack = await appendGameEvent(game.id, {
      type: "PLAYER_JOINED",
      payload: { playerId: blackId, color: "black" },
    });
    console.log(`[Matchmaking] Event black: ${JSON.stringify(eventBlack)}`);

    return game.id;
  }
  return 0;
}
