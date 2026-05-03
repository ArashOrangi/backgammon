import { addPlayerToGame, getGame } from "../../game/game.store";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";

type JoinPayload = {
  gameId: string;
};

export function handleJoin(
  ctx: SocketContext,
  payload: JoinPayload,
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

  const alreadyInGame = game.players.some((p) => p.id === playerId);

  try {
    let updatedGame = game;

    // اگر کاربر قبلا در بازی بوده، فقط دوباره join کن
    if (!alreadyInGame) {
      updatedGame = addPlayerToGame(game, playerId);
    }

    //  socket join می‌شود
    rooms.join(game.id, ctx);

    // اطلاع به اتاق که بازیکن join شد
    rooms.broadcast(game.id, {
      type: "game.join",
      payload: onOkSocketResponse({ playerId }, "Player joined"),
    });

    // ارسال وضعیت جدید بازی
    rooms.broadcast(game.id, {
      type: "game.state",
      payload: onOkSocketResponse(updatedGame),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to join game";

    ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(message),
    });
  }
}
