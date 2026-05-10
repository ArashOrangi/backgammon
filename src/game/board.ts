import { Board, PlayerId } from "./types";

/**
 * مقداردهی اولیه تخته نرد کلاسیک.
 * هر بازیکن 15 مهره دارد و توزیع اولیه مطابق استاندارد بازی است.
 */
export function createInitialBoard(
  whitePlayerId: PlayerId,
  blackPlayerId: PlayerId,
): Board {
  const points = Array.from(
    { length: 24 },
    (): { owner: PlayerId | null; count: number } => ({
      owner: null,
      count: 0,
    }),
  );

  // black
  points[0] = { owner: blackPlayerId, count: 2 };
  points[11] = { owner: blackPlayerId, count: 5 };
  points[16] = { owner: blackPlayerId, count: 3 };
  points[18] = { owner: blackPlayerId, count: 5 };

  // white
  points[23] = { owner: whitePlayerId, count: 2 };
  points[12] = { owner: whitePlayerId, count: 5 };
  points[7] = { owner: whitePlayerId, count: 3 };
  points[5] = { owner: whitePlayerId, count: 5 };

  return {
    points,
    bar: {
      [whitePlayerId]: 0,
      [blackPlayerId]: 0,
    },
    borneOff: {
      [whitePlayerId]: 0,
      [blackPlayerId]: 0,
    },
  };
}
