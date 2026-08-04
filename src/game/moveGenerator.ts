import { GameState, Move, PlayerId, SPECIAL_POSITIONS } from "./types";
import { getHomeRange, validateMove } from "./ruleValidator";
import { applyMove } from "./engine";

export interface MoveSequence {
  moves: Move[];
}

// برای فعال‌سازی لاگ‌های دیباگ، این متغیر را به true تنظیم کنید
const DEBUG_DOUBLE = true;

export function generateMoveSequences(
  game: GameState,
  playerId: PlayerId,
): MoveSequence[] {
  if (!game.dice || game.dice.length === 0) return [];

  const dice = normalizeDice(game.dice);

  if (DEBUG_DOUBLE) {
    console.log(
      `[DEBUG] generateMoveSequences: player=${playerId}, originalDice=${game.dice}, normalized=${dice}`,
    );
  }

  const results: MoveSequence[] = [];

  // ✅ آرگومان ششم (hitSources) اضافه شد
  recurse(game, playerId, dice, [], results, new Set<number>());

  if (DEBUG_DOUBLE) {
    console.log(
      `[DEBUG] generateMoveSequences: total sequences=${results.length}`,
    );
  }

  if (results.length === 0) return [];

  const maxLen = Math.max(...results.map((r) => r.moves.length));

  /**
   * Critical fix:
   * If the best sequence has length 0, it means there are no real legal moves.
   * Previously this returned [{ moves: [] }], which made calculateSubStatus think
   * the player still has playable dice.
   */
  if (maxLen === 0) {
    if (DEBUG_DOUBLE) {
      console.log(
        `[DEBUG] generateMoveSequences: maxLen=0, no real legal moves`,
      );
    }
    return [];
  }

  let filtered = results.filter((r) => r.moves.length === maxLen);

  if (DEBUG_DOUBLE) {
    console.log(
      `[DEBUG] generateMoveSequences: maxLen=${maxLen}, filtered=${filtered.length}`,
    );
  }

  if (maxLen === 1 && dice.length === 2 && dice[0] !== dice[1]) {
    const higher = Math.max(...dice);
    const hasHigher = filtered.some((seq) => seq.moves[0].die === higher);

    if (hasHigher) {
      filtered = filtered.filter((seq) => seq.moves[0].die === higher);
    }
  }

  const unique = deduplicateSequences(filtered);

  if (DEBUG_DOUBLE) {
    console.log(
      `[DEBUG] generateMoveSequences: returning ${unique.length} unique sequences`,
    );
  }

  return unique;
}

function recurse(
  game: GameState,
  playerId: PlayerId,
  dice: number[],
  path: Move[],
  results: MoveSequence[],
  hitSources: Set<number>,
) {
  if (DEBUG_DOUBLE) {
    console.log(
      `[DEBUG] recurse: dice left=${dice}, path length=${path.length}, hitSources=${[...hitSources]}`,
    );
  }
  if (dice.length === 0) {
    if (DEBUG_DOUBLE)
      console.log(`[DEBUG] recurse: no dice left, pushing path`);
    results.push({ moves: [...path] });
    return;
  }

  // تولید حرکت‌های قانونی با در نظر گرفتن hitSources
  const legal = generateSingleMoves(game, playerId, dice, hitSources);

  if (DEBUG_DOUBLE) {
    console.log(`[DEBUG] recurse: legal moves count=${legal.length}`);
  }
  if (legal.length === 0) {
    if (DEBUG_DOUBLE)
      console.log(`[DEBUG] recurse: no legal moves, pushing current path`);
    results.push({ moves: [...path] });
    return;
  }

  for (const move of legal) {
    if (DEBUG_DOUBLE) {
      console.log(
        `[DEBUG] recurse: trying move from=${move.from} to=${move.to} die=${move.die}`,
      );
    }
    const snapshot = takeSnapshot(game);
    try {
      // اعمال حرکت و دریافت نتیجه
      const result = applyMove(game, playerId, move.from, move.to, move.die);

      // ساخت مجموعه‌ی جدید از hitSources
      const newHitSources = new Set(hitSources);
      // اگر حرکت hit بود و در خونه‌ی خودی رخ داد، مبدأ را ممنوع کن
      if (result.hit && isHomePoint(game, playerId, move.to)) {
        newHitSources.add(move.from);
        if (DEBUG_DOUBLE) {
          console.log(
            `[DEBUG] recurse: hit in home, blocking source ${move.from}`,
          );
        }
      }

      const remaining = game.dice ? [...game.dice] : [];
      if (DEBUG_DOUBLE) {
        console.log(
          `[DEBUG] recurse: after apply, remaining dice=${remaining}`,
        );
      }
      // فراخوانی بازگشتی با hitSources جدید
      recurse(
        game,
        playerId,
        remaining,
        [...path, move],
        results,
        newHitSources,
      );
    } catch (err) {
      if (DEBUG_DOUBLE) {
        console.log(`[DEBUG] recurse: applyMove error: ${err}`);
      }
    } finally {
      undoSnapshot(game, snapshot);
    }
  }
}

// ✅ پارامتر hitSources اضافه شد
function generateSingleMoves(
  game: GameState,
  playerId: PlayerId,
  dice: number[],
  hitSources: Set<number>,
): Move[] {
  const moves: Move[] = [];
  const board = game.board;
  const diceToTry = [...dice];
  if (DEBUG_DOUBLE) {
    console.log(
      `[DEBUG] generateSingleMoves: dice=${diceToTry}, barCount=${board.bar[playerId] ?? 0}`,
    );
  }

  for (const die of diceToTry) {
    const barCount = board.bar[playerId] ?? 0;
    if (barCount > 0) {
      const to = computeTargetFromBar(game, playerId, die);
      console.log(
        `[DEBUG] Bar move: die=${die}, to=${to}, barCount=${barCount}`,
      );
      const res = validateMove(game, playerId, SPECIAL_POSITIONS.BAR, to, dice);
      console.log(
        `[DEBUG] validateMove result: isValid=${res.isValid}, dieUsed=${res.dieUsed}, message=${res.message}`,
      );
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
      // ✅ اگر این نقطه در لیست ممنوعه باشد، از آن حرکتی تولید نمی‌کنیم
      if (hitSources.has(i)) continue;

      const p = board.points[i];
      if (!p || p.count === 0 || p.owner !== playerId) continue;
      const to = computeTarget(game, playerId, i, die);
      if (DEBUG_DOUBLE) {
        console.log(
          `[DEBUG] generateSingleMoves: from=${i}, die=${die}, to=${to}`,
        );
      }
      const res = validateMove(game, playerId, i, to, dice);
      if (res.isValid && res.dieUsed !== undefined) {
        moves.push({
          from: i,
          to,
          die: res.dieUsed,
          ownerId: playerId,
        });
        if (DEBUG_DOUBLE)
          console.log(
            `[DEBUG] generateSingleMoves: move valid, dieUsed=${res.dieUsed}`,
          );
      } else if (DEBUG_DOUBLE) {
        console.log(
          `[DEBUG] generateSingleMoves: move invalid: ${res.message}`,
        );
      }
    }
  }
  const uniqueMoves = deduplicateMoves(moves);
  if (DEBUG_DOUBLE) {
    console.log(
      `[DEBUG] generateSingleMoves: total moves generated=${moves.length}, unique=${uniqueMoves.length}`,
    );
  }
  return uniqueMoves;
}

function normalizeDice(dice: number[]): number[] {
  if (dice.length === 2 && dice[0] === dice[1]) {
    if (DEBUG_DOUBLE)
      console.log(
        `[DEBUG] normalizeDice: double detected, converting to 4 dice`,
      );
    return [dice[0], dice[0], dice[0], dice[0]];
  }
  return [...dice];
}

function removeDie(dice: number[], die: number): number[] {
  const copy = [...dice];
  const idx = copy.indexOf(die);
  if (idx !== -1) copy.splice(idx, 1);
  if (DEBUG_DOUBLE) {
    console.log(
      `[DEBUG] removeDie: original=${dice}, remove=${die}, result=${copy}`,
    );
  }
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

function deduplicateMoves(moves: Move[]): Move[] {
  const seen = new Set<string>();
  const unique: Move[] = [];
  for (const m of moves) {
    const key = `${m.from}-${m.to}-${m.die}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(m);
    }
  }
  return unique;
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

export function computeTargetFromBar(
  game: GameState,
  playerId: PlayerId,
  die: number,
): number {
  const player = game.players.find((p) => p.id === playerId);

  if (!player) {
    throw new Error("Player not found");
  }

  if (!Number.isInteger(die) || die < 1 || die > 6) {
    throw new Error(`Invalid die for BAR entry: ${die}`);
  }

  /**
   * BAR entry mapping:
   *
   * White:
   * die 1 -> 23
   * die 2 -> 22
   * die 3 -> 21
   * die 4 -> 20
   * die 5 -> 19
   * die 6 -> 18
   *
   * Black:
   * die 1 -> 0
   * die 2 -> 1
   * die 3 -> 2
   * die 4 -> 3
   * die 5 -> 4
   * die 6 -> 5
   */
  if (player.color === "white") {
    return 24 - die;
  }

  return die - 1;
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

export function takeSnapshot(game: GameState): GameSnapshot {
  return {
    points: game.board.points.map((p) => ({ owner: p.owner, count: p.count })),
    bar: { ...game.board.bar },
    borneOff: { ...game.board.borneOff },
    dice: game.dice ? [...game.dice] : [],
  };
}

export function undoSnapshot(game: GameState, snap: GameSnapshot) {
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
  const unique = new Map<string, Move>();
  for (const move of allMoves) {
    const key = `${move.from}-${move.to}-${move.die}-${move.ownerId}`;
    if (!unique.has(key)) unique.set(key, move);
  }
  return Array.from(unique.values());
}

function isHomePoint(
  game: GameState,
  playerId: PlayerId,
  point: number,
): boolean {
  const [homeStart, homeEnd] = getHomeRange(game, playerId);
  return point >= homeStart && point <= homeEnd;
}
