import { GameState } from "@/game/types";

export function rollDice(game: GameState): number[] {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;

  const dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];

  return dice;
}
