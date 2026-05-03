import { GameState, PlayerId } from "./types";
import { validateMove } from "./rule-validator";
import { applyMove } from "./game.engine";

export interface Move {
  from: number | "bar";
  to: number | "off" | number;
  die: number;
}

export interface MoveSequence {
  moves: Move[];
}

export function generateMoveSequences(
  game: GameState,
  playerId: PlayerId,
): MoveSequence[] {
  if (!game.dice || game.dice.length === 0) return [];

  const dice = normalizeDice(game.dice);

  const results: MoveSequence[] = [];

  recurse(cloneGame(game), playerId, dice, [], results);

  if (results.length === 0) return [];

  const maxLength = Math.max(...results.map((r) => r.moves.length));
  let filtered = results.filter((r) => r.moves.length === maxLength);

  // enforce higher die rule (only when exactly 1 move possible)
  if (maxLength === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const higher = Math.max(...dice);
    const higherPlayable = filtered.some((seq) => seq.moves[0].die === higher);

    if (higherPlayable) {
      filtered = filtered.filter((seq) => seq.moves[0].die === higher);
    }
  }

  return deduplicateSequences(filtered);
}

function recurse(
  game: GameState,
  playerId: PlayerId,
  dice: number[],
  current: Move[],
  results: MoveSequence[],
) {
  if (dice.length === 0) {
    results.push({ moves: [...current] });
    return;
  }

  const legalMoves = generateSingleMoves(game, playerId, dice);

  if (legalMoves.length === 0) {
    results.push({ moves: [...current] });
    return;
  }

  for (const move of legalMoves) {
    const nextGame = cloneGame(game);

    applyMove(nextGame, playerId, move.from, move.to);

    const remainingDice = removeDie(dice, move.die);

    recurse(nextGame, playerId, remainingDice, [...current, move], results);
  }
}

function generateSingleMoves(
  game: GameState,
  playerId: PlayerId,
  dice: number[],
): Move[] {
  const moves: Move[] = [];
  const board = game.board;

  for (const die of [...dice].sort((a, b) => b - a)) {
    if (board.bar[playerId] > 0) {
      const move: Move = {
        from: "bar",
        to: computeTargetFromBar(playerId, die),
        die,
      };

      if (validateMove(game, playerId, move.from, move.to)) {
        moves.push(move);
      }

      continue;
    }

    for (let i = 0; i < board.points.length; i++) {
      const stack = board.points[i];

      if (!stack || stack.count === 0 || stack.owner !== playerId) continue;

      const to = computeTarget(playerId, i, die);

      const move: Move = { from: i, to, die };

      if (validateMove(game, playerId, move.from, move.to)) {
        moves.push(move);
      }
    }
  }

  return moves;
}

function normalizeDice(dice: number[]): number[] {
  if (dice.length === 2 && dice[0] === dice[1]) {
    return [dice[0], dice[0], dice[0], dice[0]];
  }
  return [...dice];
}

function removeDie(dice: number[], die: number): number[] {
  const copy = [...dice];
  const idx = copy.indexOf(die);
  if (idx !== -1) copy.splice(idx, 1);
  return copy;
}

function deduplicateSequences(sequences: MoveSequence[]): MoveSequence[] {
  const seen = new Set<string>();

  return sequences.filter((seq) => {
    const key = seq.moves.map((m) => `${m.from}-${m.to}-${m.die}`).join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function computeTarget(
  playerId: PlayerId,
  from: number,
  die: number,
): number | "off" {
  const dir = getDirection(playerId);
  const target = from + dir * die;

  if (target < 0 || target > 23) return "off";

  return target;
}

function computeTargetFromBar(playerId: PlayerId, die: number): number {
  return playerId === "white" ? 24 - die : die - 1;
}

function getDirection(playerId: PlayerId): number {
  return playerId === "white" ? -1 : 1;
}

function cloneGame(game: GameState): GameState {
  return JSON.parse(JSON.stringify(game));
}
