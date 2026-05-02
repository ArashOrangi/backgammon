import crypto from "crypto";

export function rollDice(): number[] {
  return [crypto.randomInt(1, 7), crypto.randomInt(1, 7)];
}
