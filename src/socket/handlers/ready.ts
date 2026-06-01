import { getGame, saveGame } from "../../game/gameStore";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import { appendGameEvent, loadGameState } from "@/game/eventStore";
import { createInitialBoard } from "@/game/board";
import { rollDie } from "@/utils/dice";
import { getDefaultTimerPreset } from "@/models/timerPreset";

export async function handleReady(
  ctx: SocketContext,
  payload: { gameId: number },
  rooms: RoomManager,
) {
  const { gameId } = payload;
  const userId = ctx.userId;
  const timerSettings = await getDefaultTimerPreset();

  if (!userId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not authenticated"),
    });
  }

  const game = getGame(gameId);
  if (!game) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Game not found"),
    });
  }

  const player = game.players.find((p) => p.id === userId);
  if (!player) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Player not in game"),
    });
  }

  if (game.status !== "ready") {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Game is not in ready state"),
    });
  }

  if (!game.readyPlayers) game.readyPlayers = [];
  if (!game.readyPlayers.includes(userId)) {
    game.readyPlayers.push(userId);
  }

  // اگر هر دو بازیکن آماده شدند → شروع خودکار بازی
  if (game.readyPlayers.length === 2) {
    const whitePlayer = game.players.find((p) => p.color === "white")!;
    const blackPlayer = game.players.find((p) => p.color === "black")!;

    const whiteDie = rollDie();
    const blackDie = rollDie();

    // ارسال تاس شروع (بدون responseState - مثل roll.ts)
    rooms.broadcast(gameId, {
      type: "dice.result",
      payload: onOkSocketResponse({
        dice: [whiteDie, blackDie],
        playerId: 0,
        type: "starting",
      }),
    });

    await appendGameEvent(gameId, {
      type: "STARTING_ROLLED",
      payload: { playerId: whitePlayer.id, value: whiteDie },
    });
    await appendGameEvent(gameId, {
      type: "STARTING_ROLLED",
      payload: { playerId: blackPlayer.id, value: blackDie },
    });

    let startingPlayerId = whitePlayer.id;
    if (whiteDie !== blackDie) {
      startingPlayerId = whiteDie > blackDie ? whitePlayer.id : blackPlayer.id;
    }

    game.board = createInitialBoard(whitePlayer.id, blackPlayer.id);

    await appendGameEvent(gameId, {
      type: "GAME_STARTED",
      payload: {
        whitePlayerId: whitePlayer.id,
        blackPlayerId: blackPlayer.id,
        startingPlayerId,
        primarySeconds: timerSettings.primarySeconds, // اضافه شد – تایمر اصلی نوبت
        secondarySeconds: timerSettings.secondarySeconds, // اضافه شد – تایمر ثانویه (در صورت نیاز)
      },
    });

    game.status = "in-progress";
    game.turn = startingPlayerId;
    game.dice = [];
    game.turnStartedAt = Date.now();
    game.lastActionAt = Date.now();
    delete game.readyPlayers;
    saveGame(game);

    const finalGame = await loadGameState(gameId);
    if (finalGame) {
      // game.state با responseState (استاندارد)
      rooms.broadcast(gameId, {
        type: "game.state",
        payload: onOkSocketResponse(finalGame, "Game started automatically"),
      });

      // game.turn بدون responseState (مثل بقیه جاها)
      rooms.broadcast(gameId, {
        type: "game.turn",
        payload: onOkSocketResponse({
          playerId: startingPlayerId,
          color: startingPlayerId === whitePlayer.id ? "white" : "black",
        }),
      });
    }
  } else {
    saveGame(game);
    const gameCopy = { ...game, subStatus: "playerJoin" as const };
    ctx.send({
      type: "game.state",
      payload: onOkSocketResponse(gameCopy, "Waiting for opponent to ready"),
    });
  }
}
