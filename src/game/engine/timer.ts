import { GameState } from "../types";

export function getTurnDeadline(game: GameState): number | null {
  if (!game.turnStartedAt || !game.turnTimeLimit) return null;
  return game.turnStartedAt + game.turnTimeLimit;
}

export function isTurnExpired(game: GameState): boolean {
  const deadline = getTurnDeadline(game);
  if (!deadline) return false;
  return Date.now() > deadline;
}

export function getRemainingTurnTime(game: GameState): number {
  const deadline = getTurnDeadline(game);
  if (!deadline) return 0;
  return Math.max(0, deadline - Date.now());
}
