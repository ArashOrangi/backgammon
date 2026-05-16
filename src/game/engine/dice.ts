import { GameState, PlayerId } from "../types";
import { rollDie, rollDice as rollDiceUtil } from "../../utils/dice";

export function rollDice(game: GameState): number[] {
  const dice = rollDiceUtil();
  game.dice = dice;
  return dice;
}

export function rollStartingDie(game: GameState, playerId: PlayerId): number {
  if (game.status !== "starting") throw new Error("Game not in starting phase");

  if (!game.startingDice) game.startingDice = {};

  if (game.startingDice[playerId])
    throw new Error("Player already rolled starting die");

  const value = rollDie();
  game.startingDice[playerId] = value;
  return value;
}
