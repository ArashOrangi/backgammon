import { GameState } from "./types";

const games = new Map<string, GameState>();

export function createGame(id: string, playerId: string): GameState {
  const game: GameState = {
    id,
    players: [playerId],
    turn: playerId,
    board: {
      points: Array.from({ length: 24 }, () => ({ owner: null, count: 0 })),
      bar: {},
      borneOff: {},
    },
    createdAt: Date.now(),
  };

  games.set(id, game);
  return game;
}

export function getGame(id: string): GameState | undefined {
  return games.get(id);
}

export function saveGame(game: GameState) {
  games.set(game.id, game);
}

export function removeGame(id: string) {
  games.delete(id);
}

export function listGames() {
  return Array.from(games.values());
}

export function addPlayerToGame(game: GameState, playerId: string): GameState {
  if (game.players.includes(playerId)) {
    throw new Error("Player already in the game");
  }

  if (game.players.length >= 2) {
    throw new Error("Game is full");
  }

  game.players.push(playerId);

  saveGame(game);

  return game;
}
