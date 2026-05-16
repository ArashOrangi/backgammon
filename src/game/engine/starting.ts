import { GameState } from "../types";

export function tryResolveStartingRoll(game: GameState) {
  if (game.status !== "starting") return;

  const players = game.players.map((p) => p.id);
  if (players.length < 2) return;

  const [p1, p2] = players;
  const d1 = game.startingDice?.[p1];
  const d2 = game.startingDice?.[p2];
  if (!d1 || !d2) return;

  if (d1 === d2) {
    game.startingDice = {};
    return;
  }

  const starter = d1 > d2 ? p1 : p2;
  game.turn = starter;
  game.dice = [d1, d2];
  game.status = "in-progress";
  delete game.startingDice;
  game.turnStartedAt = Date.now();
}
