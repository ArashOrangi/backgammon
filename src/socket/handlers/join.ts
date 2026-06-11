import {
  getGame,
  saveGame,
  createInitialGameState,
} from "../../game/gameStore";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import { addToMatchmaking } from "@/models/matchmaking";
import {
  loadGameState,
  appendGameEvent,
  forceSnapshot,
  rebuildGameStateFromScratch,
} from "@/game/eventStore";
import { prismaGameCreate } from "@/models/game";
import { prisma } from "@/components/prisma";
import { OrmState } from "@/models/enums";
import { getDefaultTimerPreset } from "@/models/timerPreset";
import { GameState } from "@/game/types";
import { sleep } from "@/components/sleep";

type JoinPayload = { gameId: number; userId: number };

// صف سوکت‌های منتظر (برای حالت انسانی)
const waitingSockets = new Map<number, SocketContext>();
const waitingTimers = new Map<number, NodeJS.Timeout>();

async function applyTimerSettingsToGame(game: GameState) {
  const preset = await getDefaultTimerPreset();
  let needUpdate = false;
  if (game.primaryTimePerTurn === 12 || game.primaryTimePerTurn === 0) {
    game.primaryTimePerTurn = preset.primarySeconds;
    needUpdate = true;
  }
  if (!game.secondaryTimeBank) game.secondaryTimeBank = {};
  for (const p of game.players) {
    if (game.secondaryTimeBank[p.id] === undefined) {
      game.secondaryTimeBank[p.id] = preset.secondarySeconds;
      needUpdate = true;
    }
  }
  if (needUpdate) {
    saveGame(game);
    await forceSnapshot(game.id, game);
  }
}

export async function handleJoin(
  ctx: SocketContext,
  payload: JoinPayload,
  rooms: RoomManager,
) {
  let { gameId, userId } = payload;
  ctx.userId = userId;

  try {
    // ---------- حالت مچ‌میکینگ (خودکار) ----------
    if (gameId === -1) {
      // جلوگیری از درخواست تکراری
      if (waitingSockets.has(userId)) {
        return ctx.send({
          type: "game.error",
          payload: onErrorSocketResponse("Already in queue"),
        });
      }

      const matchedGameId = await addToMatchmaking(userId);
      if (matchedGameId === 0) {
        // ---------- وارد صف شد ----------
        waitingSockets.set(userId, ctx);
        const waitingGame = await createInitialGameState(-1);
        waitingGame.status = "waiting";
        waitingGame.subStatus = "playerJoin";
        waitingGame.players = [{ id: userId, color: "white" }];
        ctx.send({
          type: "game.state",
          payload: onOkSocketResponse(waitingGame, "Waiting for opponent"),
        });

        // تنظیم تایمر ۱۰ ثانیه برای ساخت بات
        const timer = setTimeout(async () => {
          if (waitingSockets.has(userId)) {
            waitingSockets.delete(userId);
            waitingTimers.delete(userId);

            const gameIdForBot = await createGameWithBot(userId, 1);
            if (!gameIdForBot) {
              console.error(`Failed to create bot game for user ${userId}`);
              return;
            }

            //  منتظر بمان تا بازی واقعاً ۲ بازیکن داشته باشد (حداکثر ۱ ثانیه)
            let game: GameState | null = null;
            for (let i = 0; i < 5; i++) {
              await sleep(200);
              game = await loadGameState(gameIdForBot);
              if (game && game.players.length === 2) break;
            }
            if (!game || game.players.length !== 2) {
              console.error(
                `Bot game ${gameIdForBot} has only ${game?.players.length} players, abort`,
              );
              return;
            }

            //  ابتدا بات را به طور کامل اضافه کن (اتاق و آماده‌سازی)
            await addBotToGame(gameIdForBot, 1, rooms);

            //  سپس کاربر را به اتاق اضافه کن
            rooms.join(gameIdForBot, ctx, "player");

            //  وضعیت بازی را به ready تغییر بده
            game.status = "ready";
            game.subStatus = "gameReady";
            saveGame(game);
            await forceSnapshot(game.id, game); // snapshot بگیر

            // حالا state کامل را بفرست (حتماً ۲ بازیکن دارد)
            ctx.send({
              type: "game.state",
              payload: onOkSocketResponse(game, "Bot joined as opponent"),
            });
          }
        }, 10000);

        waitingTimers.set(userId, timer);
        return;
      } else {
        // ---------- جفت شدن با یک بازیکن انسانی دیگر ----------
        const game = await loadGameState(matchedGameId);
        if (!game) {
          return ctx.send({
            type: "game.error",
            payload: onErrorSocketResponse("Game not found"),
          });
        }

        // بررسی یکسان نبودن بازیکنان
        if (
          game.players.length === 2 &&
          game.players[0].id === game.players[1].id
        ) {
          console.error(
            `[Matchmaking] Game ${matchedGameId} has duplicate player ID ${game.players[0].id}`,
          );
          return ctx.send({
            type: "game.error",
            payload: onErrorSocketResponse("Invalid game state"),
          });
        }

        await applyTimerSettingsToGame(game);

        // لغو تایمر کاربر اول (اگر وجود داشته باشد)
        const players = game.players;
        for (const p of players) {
          const timer = waitingTimers.get(p.id);
          if (timer) {
            clearTimeout(timer);
            waitingTimers.delete(p.id);
          }
          const socket = waitingSockets.get(p.id);
          if (socket) {
            rooms.join(matchedGameId, socket, "player");
            waitingSockets.delete(p.id);
          }
        }
        rooms.join(matchedGameId, ctx, "player");

        game.status = "ready";
        game.subStatus = "gameReady";
        saveGame(game);

        rooms.broadcast(matchedGameId, {
          type: "game.state",
          payload: onOkSocketResponse(game, "Both players joined, ready"),
        });
        return;
      }
    }

    // ---------- حالت عادی (با gameId مشخص) ----------
    let game = getGame(gameId);
    if (!game) {
      game = await createInitialGameState(gameId);
      saveGame(game);
      await applyTimerSettingsToGame(game);
    } else {
      await applyTimerSettingsToGame(game);
    }

    if (
      game.players.length === 2 &&
      game.players[0].id === game.players[1].id
    ) {
      // وضعیت خراب – پاکش کن و دوباره بساز
      console.error(
        `[Join] Game ${gameId} has duplicate players. Resetting...`,
      );
      game = await createInitialGameState(gameId);
      game.players = [];
      saveGame(game);
    }

    const alreadyInGame = game.players.find((p) => p.id === userId);
    if (!alreadyInGame) {
      if (game.players.length >= 2) {
        return ctx.send({
          type: "game.error",
          payload: onErrorSocketResponse("Game is full"),
        });
      }
      const color = game.players.length === 0 ? "white" : "black";
      game.players.push({ id: userId, color });
      saveGame(game);

      if (game.players.length === 1) {
        game.subStatus = "playerJoin";
        saveGame(game);
        return ctx.send({
          type: "game.state",
          payload: onOkSocketResponse(game, "Waiting for opponent"),
        });
      } else if (game.players.length === 2) {
        rooms.join(gameId, ctx, "player");
        game.status = "ready";
        game.subStatus = "gameReady";
        game.turn = null;
        saveGame(game);
        rooms.broadcast(gameId, {
          type: "game.state",
          payload: onOkSocketResponse(game, "Both players joined, ready"),
        });
      }
    } else {
      ctx.send({
        type: "game.state",
        payload: onOkSocketResponse(game, "Rejoined"),
      });
    }
    rooms.join(gameId, ctx, "player");
  } catch (err) {
    console.error("Join Error:", err);
    ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(
        err instanceof Error ? err.message : "Join failed",
      ),
    });
  }
}

// --------------------- توابع کمکی برای ساخت بازی با بات ---------------------

async function createGameWithBot(
  whiteId: number,
  botId: number,
): Promise<number | null> {
  if (whiteId === botId) return null;
  const game = await prismaGameCreate(whiteId);
  if (!game || game === OrmState.Error) return null;
  await prisma.games.update({
    where: { id: game.id },
    data: { blackPlayerId: botId },
  });
  await appendGameEvent(game.id, {
    type: "PLAYER_JOINED",
    payload: { playerId: whiteId, color: "white" },
  });
  await appendGameEvent(game.id, {
    type: "PLAYER_JOINED",
    payload: { playerId: botId, color: "black" },
  });

  // منتظر بمان تا state کامل شود (حداکثر ۱ ثانیه)
  let state = null;
  for (let i = 0; i < 5; i++) {
    await sleep(200);
    state = await loadGameState(game.id);
    if (state && state.players.length === 2) break;
  }
  if (!state || state.players.length !== 2) {
    console.error(
      `[createGameWithBot] Failed to get full state for game ${game.id}`,
    );
    await prisma.games.delete({ where: { id: game.id } }).catch(() => {});
    return null;
  }
  await applyTimerSettingsToGame(state);
  await forceSnapshot(game.id, state);
  return game.id;
}

async function addBotToGame(gameId: number, botId: number, rooms: RoomManager) {
  const fakeCtx = {
    id: `bot-${botId}`,
    userId: botId,
    send: () => {},
    ws: { readyState: 1, send: () => {} },
  } as any;
  rooms.join(gameId, fakeCtx, "player");
  const { handleReady } = await import("./ready");
  await handleReady(fakeCtx, { gameId }, rooms);
  await sleep(50);
}

export function clearWaitingUser(userId: number) {
  const timer = waitingTimers.get(userId);
  if (timer) clearTimeout(timer);
  waitingTimers.delete(userId);
  waitingSockets.delete(userId);
}

function ensureUniquePlayers(game: GameState): boolean {
  if (game.players.length === 2 && game.players[0].id === game.players[1].id) {
    console.error(
      `Duplicate player ID ${game.players[0].id} in game ${game.id}`,
    );
    return false;
  }
  return true;
}
