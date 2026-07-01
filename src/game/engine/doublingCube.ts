import { GameState, PlayerId } from "../types";

export const MAX_CUBE_VALUE = 64;

export function isDoublingCubeEnabled(game: GameState): boolean {
  if (game.doublingCubeEnabled !== undefined) {
    return game.doublingCubeEnabled;
  }

  return game.roomType !== "CASUAL_1";
}

export function getCubeValue(game: GameState): number {
  return game.cubeValue && game.cubeValue > 0 ? game.cubeValue : 1;
}

export function getNextCubeValue(game: GameState): number {
  return getCubeValue(game) * 2;
}

export function getOpponentId(
  game: GameState,
  playerId: PlayerId,
): PlayerId | null {
  return game.players.find((p) => p.id !== playerId)?.id ?? null;
}

export function canOfferDouble(
  game: GameState,
  playerId: PlayerId,
): { ok: true; nextValue: number; opponentId: PlayerId } | { ok: false; reason: string } {
  if (!isDoublingCubeEnabled(game)) {
    return { ok: false, reason: "Doubling cube is not enabled for this room" };
  }

  if (game.status !== "in-progress") {
    return { ok: false, reason: "Game is not in progress" };
  }

  if (game.turn !== playerId) {
    return { ok: false, reason: "Not your turn" };
  }

  if (game.cubeOfferedBy || game.cubeOfferedTo) {
    return { ok: false, reason: "A doubling cube offer is already pending" };
  }

  if (game.dice?.length || game.rolledThisTurn) {
    return { ok: false, reason: "Doubling cube can only be offered before rolling" };
  }

  if (game.cubeOwner && game.cubeOwner !== playerId) {
    return { ok: false, reason: "Only the cube owner can redouble" };
  }

  const nextValue = getNextCubeValue(game);
  if (nextValue > MAX_CUBE_VALUE) {
    return { ok: false, reason: "Doubling cube is already at maximum value" };
  }

  const opponentId = getOpponentId(game, playerId);
  if (!opponentId) {
    return { ok: false, reason: "Opponent not found" };
  }

  return { ok: true, nextValue, opponentId };
}

export function getWinTypeMultiplier(
  winType: "normal" | "mars" | "backgammon",
): number {
  switch (winType) {
    case "backgammon":
      return 3;
    case "mars":
      return 2;
    case "normal":
    default:
      return 1;
  }
}

export function calculateGameScore(
  game: GameState,
  winType: "normal" | "mars" | "backgammon",
): number {
  return getCubeValue(game) * getWinTypeMultiplier(winType);
}
