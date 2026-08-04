import { GameState, PlayerId } from "../types";
import {
  generateMoveSequences,
  MoveSequence,
  takeSnapshot,
  undoSnapshot,
} from "../moveGenerator";
import { evaluateBoard } from "./evaluator";
import { applyMove } from "../engine";

function gaussianNoise(mean: number, sigma: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sigma * z;
}

export function selectMove(
  game: GameState,
  playerId: PlayerId,
  sigma: number,
): MoveSequence {
  const sequences = generateMoveSequences(game, playerId);
  if (sequences.length === 0) return { moves: [] };
  if (sequences.length === 1) return sequences[0];

  const scored = sequences.map((seq) => {
    const snapshot = takeSnapshot(game);
    try {
      for (const move of seq.moves) {
        applyMove(game, playerId, move.from, move.to, move.die);
      }
      const rawScore = evaluateBoard(game, playerId);
      const noisyScore = rawScore + gaussianNoise(0, sigma);
      return { seq, rawScore, noisyScore };
    } finally {
      undoSnapshot(game, snapshot);
    }
  });

  const best = scored.reduce((a, b) => (a.noisyScore > b.noisyScore ? a : b));
  return best.seq;
}

export function calculateDelay(
  sequences: MoveSequence[],
  action: "move" | "double" | "take" | "pass",
): number {
  const isForced = sequences.length === 1 && sequences[0]?.moves?.length === 1;
  const isCubeAction = action !== "move";

  let mu: number, sigma: number, min: number, max: number;
  if (isCubeAction) {
    mu = 3500;
    sigma = 1000;
    min = 2000;
    max = 6000;
  } else if (isForced) {
    mu = 1500;
    sigma = 400;
    min = 800;
    max = 3000;
  } else {
    mu = 2500;
    sigma = 800;
    min = 1000;
    max = 4000;
  }

  const raw = mu + gaussianNoise(0, sigma);
  return Math.min(Math.max(raw, min), max);
}
