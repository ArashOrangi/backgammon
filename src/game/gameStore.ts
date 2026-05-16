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

export function createInitialBoard() {
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
/* initial state factory                                              */
/* ------------------------------------------------------------------ */

export function createInitialGameState(gameId: string): GameState {
  return {
    id: gameId,

    players: [],

    turn: null,

    status: "waiting",

    dice: undefined,
    startingDice: {},

    board: {
      points: Array.from({ length: 24 }, () => ({
        owner: null,
        count: 0,
      })),
      bar: {},
      borneOff: {},
    },

    pipCount: {},

    cubeValue: 1,
    cubeOwner: undefined,
    cubeOffered: undefined,

    createdAt: Date.now(),

    turnStartedAt: undefined,
    turnTimeLimit: undefined,
  };
}

/* ------------------------------------------------------------------ */
/* create game                                                        */
/* ------------------------------------------------------------------ */

// export function createGame(id: string, creatorId: PlayerId): GameState {
//   const game: GameState = {
//     ...createInitialGameState(id),

//     players: [createPlayer(creatorId, "white")],

//     turn: creatorId,
//   };

//   games.set(id, game);

//   return game;
// }

export function createGame(id: string): GameState {
  const game = createInitialGameState(id);

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
  const exists = game.players.find((p) => p.id === playerId);

  // reconnect-safe
  if (exists) {
    return game;
  }

  if (game.players.length >= 2) {
    throw new Error("Game is full");
  }

  const newPlayer = createPlayer(playerId, "black");

  game.players.push(newPlayer);

  if (game.players.length === 2) {
    game.status = "ready";
  }

  saveGame(game);

  return game;
}
