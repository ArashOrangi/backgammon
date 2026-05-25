import { GameState } from "../types";

export function tryResolveStartingRoll(game: GameState): boolean {
  if (game.status !== "starting") return false;

  const players = game.players.map((p) => p.id);
  if (players.length < 2) return false;

  const [p1, p2] = players;
  const d1 = game.startingDice?.[p1];
  const d2 = game.startingDice?.[p2];

  if (!d1 || !d2) return false;

  if (d1 === d2) {
    game.startingDice = {}; // مساوی شدند، دوباره باید بریزند
    return false;
  }

  // برنده مشخص شد
  const starter = d1 > d2 ? p1 : p2;
  game.turn = starter;
  game.dice = [d1, d2];
  game.status = "in-progress";
  game.turnStartedAt = Date.now();
  delete game.startingDice;

  return true; // تغییر وضعیت انجام شد
}
