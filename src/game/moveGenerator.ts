import { GameState, PlayerId } from "./types";
import { validateMove } from "./ruleValidator";
import { applyMove } from "./engine";

/* -------------------------------------------------- */
/* TYPES */
/* -------------------------------------------------- */

export interface Move {
  from: number | "bar";
  to: number | "off" | number;
  die: number; // die actually used (validated by rule-validator)
}

export interface MoveSequence {
  moves: Move[];
}

/* -------------------------------------------------- */
/* MAIN ENTRY */
/* -------------------------------------------------- */

export function generateMoveSequences(
  game: GameState,
  playerId: PlayerId,
): MoveSequence[] {
  if (!game.dice || game.dice.length === 0) return [];

  const dice = normalizeDice(game.dice);
  const results: MoveSequence[] = [];

  // DFS با تکنیک apply/undo سریع
  recurse(game, playerId, dice, [], results);

  if (results.length === 0) return [];

  /* -------------------------------------------------- */
  /* RULE: Max Dice Usage (longest sequences only) */
  /* -------------------------------------------------- */
  const maxLen = Math.max(...results.map((r) => r.moves.length));
  let filtered = results.filter((r) => r.moves.length === maxLen);

  /* -------------------------------------------------- */
  /* RULE: Higher Die Rule (only in single-move scenarios) */
  /* -------------------------------------------------- */
  if (maxLen === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const higher = Math.max(...dice);
    const hasHigher = filtered.some((seq) => seq.moves[0].die === higher);

    if (hasHigher) {
      filtered = filtered.filter((seq) => seq.moves[0].die === higher);
    }
  }

  return deduplicateSequences(filtered);
}

/* -------------------------------------------------- */
/* DFS RECURSION (APPLY + UNDO, NO COPY) */
/* -------------------------------------------------- */

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
    // no moves → sequence ends here
    results.push({ moves: [...path] });
    return;
  }

  for (const move of legal) {
    // save snapshot for undo
    const snapshot = takeSnapshot(game);

    // mutation
    applyMove(game, playerId, move.from, move.to);

    const remaining = removeDie(dice, move.die);

    recurse(game, playerId, remaining, [...path, move], results);

    // revert state
    undoSnapshot(game, snapshot);
  }
}

/* -------------------------------------------------- */
/* SINGLE STEP MOVE GENERATION */
/* -------------------------------------------------- */

function generateSingleMoves(
  game: GameState,
  playerId: PlayerId,
  dice: number[],
): Move[] {
  const moves: Move[] = [];
  const board = game.board;

  // dice descending: prioritize larger dice first
  for (const die of [...dice].sort((a, b) => b - a)) {
    /* -------------------------------------------------- */
    /* BAR ENTRY */
    /* -------------------------------------------------- */
    if (board.bar[playerId] > 0) {
      const to = computeTargetFromBar(game, playerId, die);

      const res = validateMove(game, playerId, "bar", to);

      if (res.valid) {
        moves.push({
          from: "bar",
          to,
          die: res.dieUsed!,
        });
      }

      continue;
    }

    /* -------------------------------------------------- */
    /* BOARD MOVES */
    /* -------------------------------------------------- */

    for (let i = 0; i < 24; i++) {
      const p = board.points[i];
      if (!p || p.count === 0 || p.owner !== playerId) continue;

      const to = computeTarget(game, playerId, i, die);
      const res = validateMove(game, playerId, i, to);

      if (res.valid) {
        moves.push({
          from: i,
          to,
          die: res.dieUsed!,
        });
      }
    }
  }

  return moves;
}

/* -------------------------------------------------- */
/* HELPERS */
/* -------------------------------------------------- */

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

/* -------------------------------------------------- */
/* TARGET CALCULATIONS */
/* -------------------------------------------------- */

function computeTarget(
  game: GameState,
  playerId: PlayerId,
  from: number,
  die: number,
): number | "off" {
  const dir = getDirection(game, playerId);
  const target = from + dir * die;

  if (target < 0 || target > 23) return "off";

  return target;
}

function computeTargetFromBar(
  game: GameState,
  playerId: PlayerId,
  die: number,
): number {
  const dir = getDirection(game, playerId);

  // white (dir=-1) enters at 23 → 18
  if (dir === -1) return 24 - die;

  // black (dir=+1) enters at 0 → 5
  return die - 1;
}

/* -------------------------------------------------- */
/* GET DIRECTION FROM PLAYER COLOR */
/* -------------------------------------------------- */

function getDirection(game: GameState, playerId: PlayerId): number {
  const player = game.players.find((p) => p.id === playerId);
  return player?.color === "white" ? -1 : 1;
}

/* -------------------------------------------------- */
/* QUICK SNAPSHOT SYSTEM (FASTER THAN JSON CLONE) */
/* -------------------------------------------------- */

interface GameSnapshot {
  points: { owner: PlayerId | null; count: number }[];
  bar: Record<PlayerId, number>;
  borneOff: Record<PlayerId, number>;
}

function takeSnapshot(game: GameState): GameSnapshot {
  return {
    points: game.board.points.map((p) => ({
      owner: p.owner,
      count: p.count,
    })),
    bar: { ...game.board.bar },
    borneOff: { ...game.board.borneOff },
  };
}

function undoSnapshot(game: GameState, snap: GameSnapshot) {
  // restore points
  for (let i = 0; i < snap.points.length; i++) {
    game.board.points[i].owner = snap.points[i].owner;
    game.board.points[i].count = snap.points[i].count;
  }

  // restore bar & borne off
  game.board.bar = { ...snap.bar };
  game.board.borneOff = { ...snap.borneOff };
}
