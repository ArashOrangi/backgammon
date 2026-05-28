import { prisma } from "@/components/prisma";
import { prismaGameCreate } from "./game";
import { OrmState } from "./enums";

// صف ساده در حافظه (برای حالت development)
const waitingPlayers: number[] = []; // userId

export async function addToMatchmaking(userId: number): Promise<number> {
  waitingPlayers.push(userId);

  if (waitingPlayers.length >= 2) {
    const whiteId = waitingPlayers.shift()!;
    const blackId = waitingPlayers.shift()!;

    // ایجاد بازی جدید در دیتابیس (سفید = نفر اول)
    const game = await prismaGameCreate(whiteId);
    if (!game || game === OrmState.Error) {
      throw new Error("Failed to create game");
    }

    // به‌روزرسانی بازی با اضافه کردن بازیکن سیاه
    await prisma.games.update({
      where: { id: game.id },
      data: { blackPlayerId: blackId, status: "ACTIVE" },
    });

    return game.id;
  }

  return 0; // 0 یعنی هنوز جفت نشده
}
