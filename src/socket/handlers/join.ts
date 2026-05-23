// import { appendGameEvent, loadGameState } from "../../game/eventStore";
// import { SocketContext } from "../socket-context";
// import { RoomManager } from "../room-manager";
// import {
//   onErrorSocketResponse,
//   onOkSocketResponse,
// } from "@/responses/response-builder";
// import { saveGame } from "@/game/gameStore";

// type JoinPayload = { gameId: string };

// export async function handleJoin(
//   ctx: SocketContext,
//   payload: JoinPayload,
//   rooms: RoomManager,
// ) {
//   const { gameId } = payload;
//   const numericGameId = Number(gameId);
//   const playerId = ctx.id;

//   try {
//     let state = await loadGameState(numericGameId);
//     if (!state) {
//       return ctx.send({
//         type: "game.error",
//         payload: onErrorSocketResponse("Game not found"),
//       });
//     }

//     const alreadyInGame = state.players.some((p) => p.id === playerId);
//     if (!alreadyInGame) {
//       if (state.players.length >= 2) {
//         return ctx.send({
//           type: "game.error",
//           payload: onErrorSocketResponse("Game is full"),
//         });
//       }

//       const color: "white" | "black" =
//         state.players.length === 0 ? "white" : "black";
//       console.log(
//         `[Join] Adding player ${playerId} as ${color} to game ${gameId}`,
//       );
//       await appendGameEvent(numericGameId, {
//         type: "PLAYER_JOINED",
//         payload: { playerId, color },
//       });

//       // بارگذاری مجدد پس از JOIN
//       state = await loadGameState(numericGameId);
//       if (!state) throw new Error("Failed to reload state after join");
//       console.log(
//         `[Join] After join, game status: ${state.status}, players: ${state.players.length}`,
//       );

//       // اگر هر دو بازیکن حاضر هستند و وضعیت waiting است، شروع بازی را فعال کن
//       if (state.players.length === 2 && state.status === "waiting") {
//         console.log(`[Join] Both players ready, sending GAME_STARTING event`);
//         await appendGameEvent(numericGameId, {
//           type: "GAME_STARTING",
//           payload: {},
//         });
//         state = await loadGameState(numericGameId);
//         if (!state)
//           throw new Error("Failed to reload state after GAME_STARTING");
//         console.log(`[Join] After GAME_STARTING, game status: ${state.status}`);
//       }

//       saveGame(state);
//     } else {
//       console.log(`[Join] Player ${playerId} already in game, rejoining`);
//     }

//     rooms.join(gameId, ctx, "player");
//     rooms.broadcast(gameId, {
//       type: "game.state",
//       payload: onOkSocketResponse(state),
//     });
//   } catch (err) {
//     console.error("Join Error:", err);
//     ctx.send({
//       type: "game.error",
//       payload: onErrorSocketResponse(
//         err instanceof Error ? err.message : "Join failed",
//       ),
//     });
//   }
// }

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
import { createInitialBoard } from "@/game/board";

type JoinPayload = { gameId: string };

export async function handleJoin(
  ctx: SocketContext,
  payload: JoinPayload,
  rooms: RoomManager,
) {
  const { gameId } = payload;
  const playerId = ctx.id;

  try {
    let game = getGame(gameId);
    if (!game) {
      game = createInitialGameState(gameId);
      saveGame(game);
    }

    const alreadyInGame = game.players.some((p) => p.id === playerId);
    if (!alreadyInGame) {
      if (game.players.length >= 2) {
        return ctx.send({
          type: "game.error",
          payload: onErrorSocketResponse("Game is full"),
        });
      }

      const color = game.players.length === 0 ? "white" : "black";
      game.players.push({ id: playerId, color });

      // اگر هر دو بازیکن حاضر شدند، تخته را مقداردهی کن و وضعیت را به starting تغییر بده
      if (game.players.length === 2 && game.status === "waiting") {
        const whitePlayer = game.players.find((p) => p.color === "white")!;
        const blackPlayer = game.players.find((p) => p.color === "black")!;
        game.board = createInitialBoard(whitePlayer.id, blackPlayer.id);
        game.status = "starting";
      }

      saveGame(game);
    }

    // ارسال پاسخ join به خود کلاینت
    // ارسال پاسخ join به خود کلاینت (با cast as any برای رفع خطای تایپ موقت)
    ctx.send({
      type: "game.join",
      payload: onOkSocketResponse({ playerId }, "Player joined"),
    } as any);

    rooms.join(gameId, ctx, "player");
    rooms.broadcast(gameId, {
      type: "game.state",
      payload: onOkSocketResponse(game),
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
