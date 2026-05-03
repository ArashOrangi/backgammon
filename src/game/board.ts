import { Board, PlayerId } from "./types";

/**
 * مقداردهی اولیه تخته نرد کلاسیک.
 * هر بازیکن 15 مهره دارد و توزیع اولیه مطابق استاندارد بازی است.
 */
export function createInitialBoard(
  playerA: PlayerId,
  playerB: PlayerId,
): Board {
  const points = Array.from(
    { length: 24 },
    (): { owner: PlayerId | null; count: number } => ({
      owner: null,
      count: 0,
    }),
  );

  // توزیع اولیه مهره‌ها بر اساس استاندارد بازی
  points[0] = { owner: playerB, count: 2 };
  points[11] = { owner: playerB, count: 5 };
  points[16] = { owner: playerB, count: 3 };
  points[18] = { owner: playerB, count: 5 };

  points[23] = { owner: playerA, count: 2 };
  points[12] = { owner: playerA, count: 5 };
  points[7] = { owner: playerA, count: 3 };
  points[5] = { owner: playerA, count: 5 };

  const board: Board = {
    points,
    bar: { [playerA]: 0, [playerB]: 0 },
    borneOff: { [playerA]: 0, [playerB]: 0 },
  };
  return board;
}
