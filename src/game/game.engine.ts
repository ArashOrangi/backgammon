import { GameState, PlayerId } from "./types";
import { canBearOff } from "./rule-validator";
import { rollDie, rollDice as rollDiceUtil } from "../utils/dice";

/* -------------------------------------------------- */
/* 🎲 NORMAL ROLL */
/* -------------------------------------------------- */

export function rollDice(game: GameState): number[] {
  const dice = rollDiceUtil();
  game.dice = dice;
  return dice;
}

/* -------------------------------------------------- */
/* 🔄 TURN MANAGEMENT */
/* -------------------------------------------------- */

export function switchTurn(game: GameState) {
  const idx = game.players.findIndex((p) => p.id === game.turn);

  if (idx === -1) {
    throw new Error("Current turn player not found");
  }

  const next = (idx + 1) % game.players.length;

  game.turn = game.players[next].id;
  game.turnStartedAt = Date.now();
}

/* -------------------------------------------------- */
/* 🎯 DIE CONSUMPTION (ENGINE‑LEVEL STRICT) */
/* -------------------------------------------------- */

function consumeDie(game: GameState, distance: number) {
  if (!game.dice || game.dice.length === 0) {
    throw new Error("No dice available");
  }

  const exact = game.dice.findIndex((d) => d === distance);
  if (exact !== -1) {
    game.dice.splice(exact, 1);
    return;
  }

  throw new Error("No matching die for this move");
}

/* -------------------------------------------------- */
/* 🧭 MOVEMENT DIRECTION */
/* -------------------------------------------------- */

function getDirection(game: GameState, playerId: PlayerId): 1 | -1 {
  const player = game.players.find((p) => p.id === playerId);

  if (!player) {
    throw new Error("Player not found");
  }

  // white moves 23 → 0  (reverse)
  // black moves 0 → 23  (forward)
  return player.color === "white" ? -1 : 1;
}

/* -------------------------------------------------- */
/* 📏 DISTANCE CALCULATION */
/* -------------------------------------------------- */

function computeDistance(
  game: GameState,
  playerId: PlayerId,
  from: number | "bar",
  to: number | "off",
): number {
  const dir = getDirection(game, playerId);

  if (from === "bar") {
    const entry = dir === -1 ? 23 : 0;
    if (typeof to !== "number") throw new Error("Invalid bar entry");
    return dir === -1 ? entry - to : to - entry;
  }

  if (to === "off") {
    if (!canBearOff(game, playerId)) throw new Error("Cannot bear off yet");
    return dir === -1 ? (from as number) + 1 : 24 - (from as number);
  }

  if (typeof from === "number" && typeof to === "number") {
    return dir === -1 ? from - to : to - from;
  }

  throw new Error("Invalid move calculation");
}

/* -------------------------------------------------- */
/* 🏎 APPLY MOVE */
/* -------------------------------------------------- */

export function applyMove(
  game: GameState,
  playerId: PlayerId,
  from: number | "bar",
  to: number | "off",
): { hit: boolean; borneOff: boolean; dieUsed: number } {
  const { points, bar, borneOff } = game.board;
  const distance = computeDistance(game, playerId, from, to);

  /* --- REMOVE CHECKER FROM SOURCE --- */
  if (from === "bar") {
    if (!bar[playerId] || bar[playerId] <= 0)
      throw new Error("No checker on bar");
    bar[playerId]--;
  } else {
    if (from < 0 || from > 23) throw new Error("Source out of range");

    const src = points[from];
    if (!src || src.owner !== playerId || src.count === 0)
      throw new Error("Invalid source point");

    src.count--;
    if (src.count === 0) src.owner = null;
  }

  /* --- BEAR OFF --- */
  if (to === "off") {
    borneOff[playerId] = (borneOff[playerId] ?? 0) + 1;
    consumeDie(game, distance);
    return { hit: false, borneOff: true, dieUsed: distance };
  }

  /* --- NORMAL MOVE --- */
  if (to < 0 || to > 23) throw new Error("Destination out of range");

  const dest = points[to];
  if (dest.owner && dest.owner !== playerId && dest.count > 1)
    throw new Error("Point blocked");

  let hit = false;
  if (dest.owner && dest.owner !== playerId && dest.count === 1) {
    const opponent = dest.owner;
    bar[opponent] = (bar[opponent] ?? 0) + 1;
    dest.owner = playerId;
    dest.count = 1;
    hit = true;
  } else if (!dest.owner) {
    dest.owner = playerId;
    dest.count = 1;
  } else if (dest.owner === playerId) {
    dest.count++;
  }

  consumeDie(game, distance);
  return { hit, borneOff: false, dieUsed: distance };
}

/* -------------------------------------------------- */
/* ⏪ UNDO MOVE (Perfect reverse of applyMove) */
/* -------------------------------------------------- */

export function undoMove(
  game: GameState,
  playerId: PlayerId,
  moveInfo: { hit: boolean; borneOff: boolean; dieUsed: number },
  from: number | "bar",
  to: number | "off",
) {
  const { points, bar, borneOff } = game.board;
  const { hit, borneOff: wasBorneOff, dieUsed } = moveInfo;

  // Restore die
  if (!game.dice) game.dice = [];
  game.dice.push(dieUsed);

  /* --- BEAR OFF UNDO --- */
  if (to === "off") {
    if (!wasBorneOff) throw new Error("Undo mismatch: not a bear-off move");
    borneOff[playerId] = Math.max(0, (borneOff[playerId] ?? 0) - 1);

    const src = points[from as number];
    src.owner = playerId;
    src.count++;
    return;
  }

  /* --- NORMAL MOVE UNDO --- */
  const dest = points[to as number];
  if (hit) {
    // restore opponent checker back to destination
    const opponent = game.players.find((p) => p.id !== playerId)?.id;
    if (!opponent) throw new Error("Opponent not found during undo");

    dest.owner = opponent;
    dest.count = 1;

    // remove opponent from bar
    bar[opponent] = Math.max(0, (bar[opponent] ?? 0) - 1);
  } else {
    // destination had our checker; revert it
    if (dest.owner !== playerId)
      throw new Error("Undo mismatch: unexpected owner on dest");

    dest.count--;
    if (dest.count <= 0) {
      dest.count = 0;
      dest.owner = null;
    }
  }

  // restore checker to original location
  if (from === "bar") {
    bar[playerId] = (bar[playerId] ?? 0) + 1;
  } else {
    const src = points[from as number];
    src.owner = playerId;
    src.count++;
  }
}

/* -------------------------------------------------- */
/* 🏁 GAME OVER CHECK */
/* -------------------------------------------------- */

export function isGameOver(game: GameState): boolean {
  return game.players.some((p) => (game.board.borneOff[p.id] ?? 0) >= 15);
}

/* -------------------------------------------------- */
/* ⭐ STARTING PHASE LOGIC */
/* -------------------------------------------------- */

export function rollStartingDie(game: GameState, playerId: PlayerId): number {
  if (game.status !== "starting") throw new Error("Game not in starting phase");

  if (!game.startingDice) game.startingDice = {};

  if (game.startingDice[playerId])
    throw new Error("Player already rolled starting die");

  const value = rollDie();
  game.startingDice[playerId] = value;
  return value;
}

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
