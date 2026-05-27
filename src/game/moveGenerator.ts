import { GameState, Move, PlayerId, SPECIAL_POSITIONS } from "./types";
import { validateMove } from "./ruleValidator";
import { applyMove } from "./engine";

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
  recurse(game, playerId, dice, [], results);
  if (results.length === 0) return [];
  const maxLen = Math.max(...results.map((r) => r.moves.length));
  let filtered = results.filter((r) => r.moves.length === maxLen);
  if (maxLen === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const higher = Math.max(...dice);
    const hasHigher = filtered.some((seq) => seq.moves[0].die === higher);
    if (hasHigher)
      filtered = filtered.filter((seq) => seq.moves[0].die === higher);
  }
  return deduplicateSequences(filtered);
}

function recurse(
  game: GameState,
  playerId: PlayerId,
  dice: number[],
  path: Move[],
  results: MoveSequence[],
) {
  if (dice.length === 0) {
    results.push({ moves: [...path] });
    return;
  }
  const legal = generateSingleMoves(game, playerId, dice);
  if (legal.length === 0) {
    results.push({ moves: [...path] });
    return;
  }
  for (const move of legal) {
    const snapshot = takeSnapshot(game);
    try {
      applyMove(game, playerId, move.from, move.to);
      const remaining = removeDie(dice, move.die);
      recurse(game, playerId, remaining, [...path, move], results);
    } catch (err) {
      // ignore
    } finally {
      undoSnapshot(game, snapshot);
    }
  }
}

function generateSingleMoves(
  game: GameState,
  playerId: PlayerId,
  dice: number[],
): Move[] {
  const moves: Move[] = [];
  const board = game.board;
  const sortedDice = [...dice].sort((a, b) => b - a);

  for (const die of sortedDice) {
    const barCount = board.bar[playerId] ?? 0;
    if (barCount > 0) {
      const to = computeTargetFromBar(game, playerId, die);
      const res = validateMove(game, playerId, SPECIAL_POSITIONS.BAR, to, dice);
      if (res.isValid && res.dieUsed !== undefined) {
        moves.push({
          from: SPECIAL_POSITIONS.BAR,
          to,
          die: res.dieUsed,
          ownerId: playerId,
        });
      }
      continue;
    }

    for (let i = 0; i < 24; i++) {
      const p = board.points[i];
      if (!p || p.count === 0 || p.owner !== playerId) continue;
      const to = computeTarget(game, playerId, i, die);
      const res = validateMove(game, playerId, i, to, dice);
      if (res.isValid && res.dieUsed !== undefined) {
        moves.push({
          from: i,
          to,
          die: res.dieUsed,
          ownerId: playerId,
        });
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
  game: GameState,
  playerId: PlayerId,
  from: number,
  die: number,
): number {
  const dir = getDirection(game, playerId);
  if (dir === -1) {
    const target = from - die;
    if (target < 0) return SPECIAL_POSITIONS.BEAR_OFF_WHITE;
    return target;
  } else {
    const target = from + die;
    if (target > 23) return SPECIAL_POSITIONS.BEAR_OFF_BLACK;
    return target;
  }
}

function computeTargetFromBar(
  game: GameState,
  playerId: PlayerId,
  die: number,
): number {
  const dir = getDirection(game, playerId);
  if (dir === -1) return 24 - die; // white
  return die - 1; // black
}

function getDirection(game: GameState, playerId: PlayerId): number {
  const player = game.players.find((p) => p.id === playerId);
  return player?.color === "white" ? -1 : 1;
}

interface GameSnapshot {
  points: { owner: PlayerId | null; count: number }[];
  bar: Record<PlayerId, number>;
  borneOff: Record<PlayerId, number>;
  dice: number[];
}

function takeSnapshot(game: GameState): GameSnapshot {
  return {
    points: game.board.points.map((p) => ({ owner: p.owner, count: p.count })),
    bar: { ...game.board.bar },
    borneOff: { ...game.board.borneOff },
    dice: game.dice ? [...game.dice] : [],
  };
}

function undoSnapshot(game: GameState, snap: GameSnapshot) {
  for (let i = 0; i < snap.points.length; i++) {
    game.board.points[i].owner = snap.points[i].owner;
    game.board.points[i].count = snap.points[i].count;
  }
  game.board.bar = { ...snap.bar };
  game.board.borneOff = { ...snap.borneOff };
  game.dice = snap.dice.length ? [...snap.dice] : undefined;
}

export function flattenMoveSequences(sequences: MoveSequence[]): Move[] {
  const allMoves: Move[] = [];
  for (const seq of sequences) {
    allMoves.push(...seq.moves);
  }
  // حذف حرکات تکراری (از نظر from, to, die, ownerId)
  const unique = new Map<string, Move>();
  for (const move of allMoves) {
    const key = `${move.from}-${move.to}-${move.die}-${move.ownerId}`;
    if (!unique.has(key)) unique.set(key, move);
  }
  return Array.from(unique.values());
}
