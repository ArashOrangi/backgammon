import { GameState, PlayerId, PlayerInfo } from "./types";

/* ------------------------------------------------------------------ */
/* در آینده میتونی اینو بندازی روی Redis یا DB، فعلاً in-memory map */
/* ------------------------------------------------------------------ */

const games = new Map<string, GameState>();

/* ------------------------------------------------------------------ */
/* ایجاد بازیکن با رنگ مشخص                                          */
/* ------------------------------------------------------------------ */

function createPlayer(id: PlayerId, color: "white" | "black"): PlayerInfo {
  return { id, color };
}

/* ------------------------------------------------------------------ */
/* ایجاد بازی جدید                                                     */
/* creator همیشه white است                                             */
/* ------------------------------------------------------------------ */

export function createGame(id: string, creatorId: PlayerId): GameState {
  const game: GameState = {
    id,
    createdAt: Date.now(),

    players: [createPlayer(creatorId, "white")],

    status: "waiting",

    turn: creatorId,

    board: {
      points: Array.from({ length: 24 }, () => ({
        owner: null,
        count: 0,
      })),

      bar: {
        [creatorId]: 0,
      },

      borneOff: {
        [creatorId]: 0,
      },
    },
  };

  games.set(id, game);
  return game;
}

/* ------------------------------------------------------------------ */
/* واکشی / ذخیره / حذف بازی                                           */
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
/* اضافه‌کردن بازیکن دوم (black)                                      */
/* ------------------------------------------------------------------ */

export function addPlayerToGame(
  game: GameState,
  playerId: PlayerId,
): GameState {
  if (game.players.some((p) => p.id === playerId)) {
    throw new Error("Player already in the game");
  }

  if (game.players.length >= 2) {
    throw new Error("Game is full");
  }

  // بازیکن دوم = black
  const newPlayer = createPlayer(playerId, "black");
  game.players.push(newPlayer);

  // رکورد bar و borneOff را برای بازیکن جدید اضافه کن
  game.board.bar[playerId] = 0;
  game.board.borneOff[playerId] = 0;

  // ورود بازیکن دوم = رفتن به فاز starting
  game.status = "starting";

  saveGame(game);
  return game;
}
