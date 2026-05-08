import { GameState, PlayerId, PlayerInfo } from "./types";

/* ------------------------------------------------------------------ */
/* in-memory store (later: Redis / DB)                                */
/* ------------------------------------------------------------------ */

const games = new Map<string, GameState>();

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

function createPlayer(id: PlayerId, color: "white" | "black"): PlayerInfo {
  return { id, color };
}

/* ------------------------------------------------------------------ */
/* Backgammon initial board                                           */
/* ------------------------------------------------------------------ */

function createInitialBoard() {
  const points = Array.from({ length: 24 }, () => ({
    owner: null as "white" | "black" | null,
    count: 0,
  }));

  // white
  points[23] = { owner: "white", count: 2 };
  points[12] = { owner: "white", count: 5 };
  points[7] = { owner: "white", count: 3 };
  points[5] = { owner: "white", count: 5 };

  // black
  points[0] = { owner: "black", count: 2 };
  points[11] = { owner: "black", count: 5 };
  points[16] = { owner: "black", count: 3 };
  points[18] = { owner: "black", count: 5 };

  return {
    points,

    bar: {
      white: 0,
      black: 0,
    },

    borneOff: {
      white: 0,
      black: 0,
    },
  };
}

/* ------------------------------------------------------------------ */
/* create game                                                        */
/* ------------------------------------------------------------------ */

export function createGame(id: string, creatorId: PlayerId): GameState {
  const game: GameState = {
    id,
    createdAt: Date.now(),

    players: [createPlayer(creatorId, "white")],

    status: "waiting",

    turn: "white",

    board: createInitialBoard(),
  };

  games.set(id, game);

  return game;
}

/* ------------------------------------------------------------------ */
/* basic store ops                                                    */
/* ------------------------------------------------------------------ */

export function getGame(id: string): GameState | undefined {
  return games.get(id);
}

export function saveGame(game: GameState) {
  games.set(game.id, game);
}

export function deleteGame(id: string) {
  games.delete(id);
}

export function listGames(): GameState[] {
  return Array.from(games.values());
}

/* ------------------------------------------------------------------ */
/* join second player                                                 */
/* ------------------------------------------------------------------ */

export function addPlayerToGame(
  game: GameState,
  playerId: PlayerId,
): GameState {
  // اگر قبلا داخل بازی بوده (reconnect)
  const exists = game.players.find((p) => p.id === playerId);

  if (exists) {
    return game;
  }

  if (game.players.length >= 2) {
    throw new Error("Game is full");
  }

  const newPlayer = createPlayer(playerId, "black");

  game.players.push(newPlayer);

  // وقتی 2 نفر شدند بازی آماده است
  if (game.players.length === 2) {
    game.status = "ready";
  }

  saveGame(game);

  return game;
}
