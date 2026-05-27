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

      ctx.send({
        type: "player.assign",
        payload: { color, playerId: userId },
      });

      if (game.players.length === 2) {
        game.status = "ready";
        rooms.broadcast(gameId, {
          type: "room.ready",
          payload: { gameId },
        });
        game.status = "starting";
        // طبق سناریو، در فاز starting نوبت را به بازیکن سفید (بازیکن اول) اختصاص می‌دهیم
        const whitePlayer = game.players.find((p) => p.color === "white");
        if (whitePlayer) {
          game.turn = whitePlayer.id;
        }
      }

      saveGame(game);
    }

    rooms.join(gameId, ctx, "player");

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
