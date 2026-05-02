import { GameState } from "./types";

export function rollDice(game: GameState): number[] {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;

  const dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];

  return dice;
}

export function applyMove(
  game: any,
  playerId: string,
  from: number | "bar",
  to: number | "off",
) {
  // TODO: rule‑validation logic
  console.log(`Move by ${playerId}: ${from} -> ${to}`);
}
