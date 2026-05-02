export function rollDice(game: any) {
  const d1 = Math.floor(Math.random() * 6) + 1;
  const d2 = Math.floor(Math.random() * 6) + 1;
  game.dice = [d1, d2];
  return game.dice;
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
