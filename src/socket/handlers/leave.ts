import { getGame, saveGame, deleteGame } from "../../game/game.store";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";

import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";

type LeavePayload = {
  gameId: string;
};

export function handleLeave(
  ctx: SocketContext,
  payload: LeavePayload,
  rooms: RoomManager,
) {
  const { gameId } = payload;
  const playerId = ctx.id;

  const game = getGame(gameId);

  if (!game) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Game not found"),
    });
  }

  const player = game.players.find((p) => p.id === playerId);

  if (!player) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Player not found in game"),
    });
  }

  try {
    // خروج بازیکن
    game.players = game.players.filter((p) => p.id !== playerId);

    // پاکسازی state مخصوص بازیکن
    delete game.board.bar[playerId];
    delete game.board.borneOff[playerId];

    if (game.startingDice) delete game.startingDice[playerId];
    if (game.pipCount) delete game.pipCount[playerId];

    // خارج کردن از اتاق
    rooms.leave(ctx);

    // اگر آخرین بازیکن خارج شد → بازی حذف شود
    if (game.players.length === 0) {
      deleteGame(game.id);
      return;
    }

    // اگر فقط یک بازیکن باقی ماند → ریست کردن بازی به حالت waiting
    if (game.players.length === 1) {
      game.status = "waiting";
      game.turn = game.players[0].id;
      game.dice = undefined;
      game.startingDice = {};
      game.cubeOffered = undefined;
      game.cubeOwner = undefined;
      game.cubeValue = undefined;
      game.winner = undefined;
      game.winType = undefined;
      game.score = undefined;
    }

    saveGame(game);

    // اطلاع به بقیه بازیکنان که نفر رفت
    rooms.broadcast(game.id, {
      type: "game.leave",
      payload: onOkSocketResponse({ playerId }, "Player left game"),
    });

    // ارسال state جدید
    rooms.broadcast(game.id, {
      type: "game.state",
      payload: onOkSocketResponse(game),
    });
  } catch (err) {
    ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(
        err instanceof Error ? err.message : "Failed to leave game",
      ),
    });
  }
}
