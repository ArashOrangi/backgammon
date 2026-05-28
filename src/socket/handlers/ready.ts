import { getGame, saveGame } from "../../game/gameStore";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";

export async function handleReady(
  ctx: SocketContext,
  payload: { gameId: number },
  rooms: RoomManager,
) {
  const { gameId } = payload;
  const userId = ctx.userId;
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

  // بررسی اینکه بازیکن در بازی هست
  const player = game.players.find((p) => p.id === userId);
  if (!player) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Player not in game"),
    });
  }

  // اگر بازی در وضعیت ready نباشد، نباید ready را قبول کند
  if (game.status !== "ready") {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Game is not in ready state"),
    });
  }

  // نگهداری set آمادگی بازیکنان
  if (!game.readyPlayers) {
    game.readyPlayers = [];
  }
  if (!game.readyPlayers.includes(userId)) {
    game.readyPlayers.push(userId);
  }

  // اگر هر دو بازیکن ready کردند
  if (game.readyPlayers.length === 2) {
    game.status = "starting";
    game.subStatus = "turnRoll";
    game.turn = game.players.find((p) => p.color === "white")?.id ?? null;
    delete game.readyPlayers; // حذف فیلد پس از استفاده
    saveGame(game);
    rooms.broadcast(gameId, {
      type: "game.state",
      payload: onOkSocketResponse(game),
    });
  } else {
    saveGame(game);
  }
}
