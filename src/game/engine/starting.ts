import { GameState, PlayerId } from "../types";

export interface StartingRollResolution {
  resolved: boolean;
  starterId?: PlayerId;
  dice?: number[];
  shouldResetStartingDice?: boolean; // در صورت مساوی بودن تاس‌ها
}

export function tryResolveStartingRoll(
  game: GameState,
): StartingRollResolution {
  // فقط خواندن از game، بدون تغییر
  if (game.status !== "starting") return { resolved: false };

  const players = game.players.map((p) => p.id);
  if (players.length < 2) return { resolved: false };

  const [p1, p2] = players;
  const d1 = game.startingDice?.[p1];
  const d2 = game.startingDice?.[p2];

  if (!d1 || !d2) return { resolved: false };

  if (d1 === d2) {
    return { resolved: false, shouldResetStartingDice: true };
  }

  const starterId = d1 > d2 ? p1 : p2;
  return { resolved: true, starterId, dice: [d1, d2] };
}
