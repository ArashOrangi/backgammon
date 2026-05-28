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
import { calculateSubStatus } from "@/game/eventStore";
import {
  flattenMoveSequences,
  generateMoveSequences,
} from "@/game/moveGenerator";

type JoinPayload = { gameId: number; userId: number };

export async function handleJoin(
  ctx: SocketContext,
  payload: JoinPayload,
  rooms: RoomManager,
) {
  const { gameId, userId } = payload;
  ctx.userId = userId;

  try {
    let game = getGame(gameId);
    if (!game) {
      game = createInitialGameState(gameId);
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

      // حذف ارسال player.assign - رنگ از طریق game.state در اختیار کلاینت قرار می‌گیرد

      if (game.players.length === 2) {
        // پس از دومین جوین، بازی آماده است ولی هنوز شروع نشده
        game.status = "ready";
        game.subStatus = "gameReady";
        // نوبت را خالی می‌گذاریم (بعد از دریافت player.readyها مشخص می‌شود)
        game.turn = null;
        saveGame(game);

        rooms.broadcast(gameId, {
          type: "game.state",
          payload: onOkSocketResponse(game),
        });
        // دیگر status را به starting تغییر نمی‌دهیم
        // منتظر می‌مانیم تا handleReady کار خود را انجام دهد
      }
      saveGame(game);
    }

    rooms.join(gameId, ctx, "player");

    // محاسبه subStatus و legalMoves برای ارسال state نهایی
    const subStatus = calculateSubStatus(game);
    let legalMoves: any[] = [];
    if (game.turn !== null) {
      legalMoves = generateMoveSequences(game, game.turn);
    }
    const flatLegalMoves = flattenMoveSequences(legalMoves);
    const stateToSend = {
      ...game,
      subStatus,
      legalMoves: flatLegalMoves,
    };

    rooms.broadcast(gameId, {
      type: "game.state",
      payload: onOkSocketResponse(stateToSend),
    });
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
