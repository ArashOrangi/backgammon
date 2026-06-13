import { RoomType } from "@prisma/client";

// جدول R1 تا R9 (بر اساس PDF)
const ROOM_BASE_POINTS: Record<number, { win: number; loss: number }> = {
  1: { win: 8, loss: 1 },
  2: { win: 11, loss: 1 },
  3: { win: 17, loss: 2 },
  4: { win: 23, loss: 2 },
  5: { win: 30, loss: 3 },
  6: { win: 38, loss: 3 },
  7: { win: 47, loss: 4 },
  8: { win: 57, loss: 4 },
  9: { win: 68, loss: 5 },
};

// نگاشت اتاق‌های برنامه به اعداد R
export const ROOM_TO_R_MAP: Record<RoomType, number> = {
  [RoomType.CASUAL_1]: 1,
  [RoomType.CASUAL_2]: 3,
  [RoomType.COMPETITIVE_1]: 5,
  [RoomType.COMPETITIVE_2]: 7,
};

export function getBasePoints(roomType: RoomType, isWin: boolean): number {
  const r = ROOM_TO_R_MAP[roomType];
  const points = ROOM_BASE_POINTS[r];
  if (!points) throw new Error(`Unknown room type: ${roomType}`);
  return isWin ? points.win : points.loss;
}

export function getWinTypeBonus(winType?: string): number {
  switch (winType) {
    case "mars":
      return 7;
    case "backgammon":
      return 10;
    default:
      return 0;
  }
}
