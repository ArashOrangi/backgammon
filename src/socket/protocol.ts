import { GameState } from "@/game/types";
import { IDataResponse } from "@/responses/ResponseStates";

// ---------- Client Messages ----------
export type ClientMessage =
  | { type: "game.join"; payload: { gameId: number; userId: number } }
  | { type: "game.roll"; payload: { gameId: number } }
  | {
      type: "game.move";
      payload: {
        gameId: number;
        from: number;
        to: number;
        die?: number; // عدد تاس مصرفی (در صورت نیاز)
        isUndo?: boolean; // true اگر درخواست برگشت حرکت است
      };
    }
  | { type: "player.leave"; payload: { gameId: number } }
  | { type: "player.ready"; payload: { gameId: number } }
  | { type: "game.endTurn"; payload: { gameId: number } };

// ---------- Server Messages ----------
export type ServerMessage =
  // General responses
  | {
      type: "game.state";
      payload: IDataResponse<GameState>; // درون data.subStatus وضعیت دقیق (gameReady, turnRoll, playDice, ...)
    }
  | {
      type: "game.error";
      payload: IDataResponse<any, any>;
    }
  // Game flow events (بدون player.assign و room.ready)
  | {
      type: "dice.result";
      payload: { dice: number[]; playerId: number; type?: "starting" };
    }
  | {
      type: "game.turn";
      payload: { playerId: number; color?: "white" | "black" };
    }
  | {
      type: "player.move";
      payload:
        | {
            playerId: number;
            from: number;
            to: number;
            die: number;
            ownerId: number;
            isUndo?: boolean;
          }
        | Array<{
            playerId: number;
            from: number;
            to: number;
            die: number;
            ownerId: number;
            isUndo?: boolean;
          }>;
    }
  | {
      type: "game.legalMoves";
      payload: IDataResponse<any>; // آرایه‌ای از مسیرهای حرکتی
    }
  | {
      type: "turn.timeout";
      payload: { playerId: number };
    }
  | {
      type: "network.timeout";
      payload: { playerId: number; timeoutAt?: number };
    }
  | {
      type: "game.result";
      payload: {
        winner: number;
        winType?: "normal" | "mars" | "backgammon";
        reason: string;
      };
    };
// حذف شد: player.assign, room.ready, game.undo (چون undo از طریق game.move.isUndo=true انجام می‌شود)
