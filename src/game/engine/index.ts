import { GameState } from "../types";

export * from "./move";
export * from "./turn";
export * from "./timer";
export * from "./dice";
export * from "./starting";

/* -------------------------------------------------- */
/* 🏁 GAME OVER CHECK */
/* -------------------------------------------------- */

export function isGameOver(game: GameState): boolean {
  return game.players.some((p) => (game.board.borneOff[p.id] ?? 0) >= 15);
}
