import { GameState } from "../types";

export function switchTurn(game: GameState) {
  const idx = game.players.findIndex((p) => p.id === game.turn);

  if (idx === -1) {
    throw new Error("Current turn player not found");
  }

  const next = (idx + 1) % game.players.length;

  game.turn = game.players[next].id;

  game.turnStartedAt = Date.now();
  game.lastActionAt = Date.now();
}
