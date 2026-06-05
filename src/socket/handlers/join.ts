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
} from "@/game/eventStore";
import { prismaGameCreate } from "@/models/game";
import { prisma } from "@/components/prisma";
import { OrmState } from "@/models/enums";
import { getDefaultTimerPreset } from "@/models/timerPreset";
import { GameState } from "@/game/types";

type JoinPayload = { gameId: number; userId: number };

// صف سوکت‌های منتظر (برای حالت انسانی - اگر نیاز دارید نگه دارید)
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
      // ساخت مستقیم بازی با بات (بدون صف و تایمر)
      const gameIdForBot = await createGameWithBot(userId, 1);
      if (!gameIdForBot) {
        return ctx.send({
          type: "game.error",
          payload: onErrorSocketResponse("Failed to create bot game"),
        });
      }
      const game = await loadGameState(gameIdForBot);
      if (!game) return;

      await applyTimerSettingsToGame(game);
      rooms.join(gameIdForBot, ctx, "player");
      game.status = "ready";
      game.subStatus = "gameReady";
      saveGame(game);

      ctx.send({
        type: "game.state",
        payload: onOkSocketResponse(game, "Bot joined as opponent"),
      });

      await addBotToGame(gameIdForBot, 1, rooms);
      return;
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
  const game = await prismaGameCreate(whiteId);
  if (!game || game === OrmState.Error) {
    console.error(`[createGameWithBot] failed for whiteId=${whiteId}`);
    return null;
  }
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
  const state = await loadGameState(game.id);
  if (state) await applyTimerSettingsToGame(state);
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
  // دیگر نیازی به start جداگانه نیست، چون runBotIfNeeded در handleReady و سایر هندلرها کار می‌کند
}
