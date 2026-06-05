import { getDefaultTimerPreset } from "@/models/timerPreset";
import { GameState, PlayerId, PlayerInfo } from "./types";

const games = new Map<number, GameState>();

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function createPlayer(id: PlayerId, color: "white" | "black"): PlayerInfo {
  return { id, color };
}

/* ------------------------------------------------------------------ */
/* Backgammon initial board (Fixed with Player IDs)                   */
/* ------------------------------------------------------------------ */

// حالا آیدی بازیکن‌ها رو می‌گیره تا آبجکت‌های bar و borneOff رو درست بسازه
export function createInitialBoard(whiteId: PlayerId, blackId: PlayerId) {
  const points = Array.from({ length: 24 }, () => ({
    owner: null as PlayerId | null,
    count: 0,
  }));

  // White checkers (Starting positions)
  points[23] = { owner: whiteId, count: 2 };
  points[12] = { owner: whiteId, count: 5 };
  points[7] = { owner: whiteId, count: 3 };
  points[5] = { owner: whiteId, count: 5 };

  // Black checkers (Starting positions)
  points[0] = { owner: blackId, count: 2 };
  points[11] = { owner: blackId, count: 5 };
  points[16] = { owner: blackId, count: 3 };
  points[18] = { owner: blackId, count: 5 };

  return {
    points,
    bar: {
      [whiteId]: 0,
      [blackId]: 0,
    },
    borneOff: {
      [whiteId]: 0,
      [blackId]: 0,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Initial state factory                                              */
/* ------------------------------------------------------------------ */

export async function createInitialGameState(
  gameId: number,
): Promise<GameState> {
  const preset = await getDefaultTimerPreset();
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
    createdAt: Date.now(),
    lastActionAt: Date.now(),
    turnStartedAt: undefined,
    turnTimeLimit: 30, // ممکن است بعداً حذف شود
    primaryTimePerTurn: preset.primarySeconds,
    secondaryTimeBank: {}, // خالی بماند تا بعداً پر شود? اما بهتر است برای بازیکنان آینده مقداردهی نشود چون هنوز بازیکنی نیست
  };
}

/* ------------------------------------------------------------------ */
/* Store Ops                                                          */
/* ------------------------------------------------------------------ */

export async function createGame(id: number): Promise<GameState> {
  const game = await createInitialGameState(id);
  games.set(id, game);
  return game;
}

export function getGame(id: number): GameState | undefined {
  return games.get(id);
}

export function saveGame(game: GameState) {
  game.lastActionAt = Date.now(); // هر بار ذخیره، زمان آخرین فعالیت آپدیت بشه
  games.set(game.id, game);
}

export function deleteGame(id: number) {
  games.delete(id);
}

// این همون تابعی که Game Loop مرکزی بهش نیاز داره
export function getAllActiveGames(): GameState[] {
  return Array.from(games.values());
}

/* ------------------------------------------------------------------ */
/* Player Management                                                  */
/* ------------------------------------------------------------------ */

export function addPlayerToGame(
  game: GameState,
  playerId: PlayerId,
): GameState {
  const exists = game.players.find((p) => p.id === playerId);
  if (exists) return game;

  if (game.players.length >= 2) {
    throw new Error("Game is full");
  }

  // نفر اول سفید، نفر دوم سیاه
  const color = game.players.length === 0 ? "white" : "black";
  const newPlayer = createPlayer(playerId, color);

  game.players.push(newPlayer);

  if (game.players.length === 2) {
    game.status = "ready";

    // مقداردهی اولیه برد بلافاصله بعد از آماده شدن
    const white = game.players.find((p) => p.color === "white")!;
    const black = game.players.find((p) => p.color === "black")!;
    game.board = createInitialBoard(white.id, black.id);
  }

  saveGame(game);
  return game;
}
