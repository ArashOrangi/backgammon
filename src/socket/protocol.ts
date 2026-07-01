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
  | { type: "game.endTurn"; payload: { gameId: number } }
  | { type: "game.cube.offer"; payload: { gameId: number } }
  | {
      type: "game.cube.respond";
      payload: { gameId: number; accept: boolean };
    }
  | { type: "game.practice.bearoff"; payload: { gameId: number } }
  | {
      type: "game.practice.rearrange";
      payload: {
        gameId: number;
        points: Array<{ index: number; count: number }>;
      };
    }
  | {
      type: "game.practice.setup_board";
      payload: {
        gameId: number;
        board: {
          points: Array<{ owner: number | null; count: number }>;
          bar: Record<number, number>;
          borneOff: Record<number, number>;
        };
      };
    };

// ---------- Server Messages ----------
export type ServerMessage =
  // General responses
  | { type: "game.state"; payload: IDataResponse<GameState> }
  | { type: "game.error"; payload: IDataResponse<any> }
  | { type: "game.legalMoves"; payload: IDataResponse<any> }
  // Game flow events (حالا همگی IDataResponse دارند)
  | {
      type: "dice.result";
      payload: IDataResponse<{
        dice: number[];
        playerId: number;
        type?: "starting";
      }>;
    }
  | {
      type: "game.turn";
      payload: IDataResponse<{ playerId: number; color?: "white" | "black" }>;
    }
  | { type: "player.move"; payload: IDataResponse<MovePayload> } // MovePayload می‌تواند تکی یا آرایه‌ای باشد
  | {
      type: "game.cube.offer";
      payload: IDataResponse<{
        offeredBy: number;
        offeredTo: number;
        value: number;
        previousValue: number;
      }>;
    }
  | {
      type: "game.cube.accepted";
      payload: IDataResponse<{
        acceptedBy: number;
        offeredBy: number;
        value: number;
        owner: number;
      }>;
    }
  | {
      type: "game.cube.rejected";
      payload: IDataResponse<{
        rejectedBy: number;
        winner: number;
        score: number;
      }>;
    }
  | { type: "turn.timeout"; payload: IDataResponse<{ playerId: number }> }
  | {
      type: "network.timeout";
      payload: IDataResponse<{ playerId: number; timeoutAt?: number }>;
    }
  | {
      type: "game.result";
      payload: IDataResponse<{
        winner: number;
        winType?: "normal" | "mars" | "backgammon";
        reason: string;
        score?: number;
      }>;
    };

// تعریف نوع MovePayload در همان فایل یا فایل جداگانه
export type MovePayload =
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
// حذف شد: player.assign, room.ready, game.undo (چون undo از طریق game.move.isUndo=true انجام می‌شود)
