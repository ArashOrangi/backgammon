import { GameState } from "../types";

export function switchTurn(game: GameState) {
  // کسر زمان اضافی مصرف شده توسط بازیکن قبلی
  if (game.turn && game.turnStartedAt) {
    const now = Date.now();
    const elapsed = (now - game.turnStartedAt) / 1000;
    const primary = game.primaryTimePerTurn;
    if (elapsed > primary) {
      const extra = elapsed - primary;
      const bank = game.secondaryTimeBank[game.turn];
      if (bank !== undefined) {
        const newBank = bank - extra;
        game.secondaryTimeBank[game.turn] = newBank > 0 ? newBank : 0;
      }
    }
  }

  const idx = game.players.findIndex((p) => p.id === game.turn);
  if (idx === -1) throw new Error("Current turn player not found");
  const next = (idx + 1) % game.players.length;
  game.turn = game.players[next].id;
  game.turnStartedAt = Date.now();
  game.lastActionAt = Date.now();
}
