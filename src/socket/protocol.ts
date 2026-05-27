import { GameState } from "@/game/types";
import { IDataResponse } from "@/responses/ResponseStates";

// ---------- Client Messages ----------
export type ClientMessage =
  | {
      type: "game.join";
      payload: { gameId: number; userId: number };
    }
  | {
      type: "game.roll";
      payload: { gameId: number };
    }
  | {
      type: "game.move";
      payload: { gameId: number; from: number; to: number; die: number };
    }
  | {
      type: "game.endTurn";
      payload: { gameId: number };
    }
  | {
      type: "player.leave";
      payload: { gameId: number };
    };

// ---------- Server Messages ----------
export type ServerMessage =
  // General responses
  | {
      type: "game.state";
      payload: IDataResponse<GameState>;
    }
  | {
      type: "game.error";
      payload: IDataResponse<any, any>; //  اجازه هر نوع extra
    }
  // Game flow events
  | {
      type: "player.assign";
      payload: { color: "white" | "black"; playerId: number };
    }
  | {
      type: "room.ready";
      payload: { gameId: number };
    }
  | {
      type: "dice.result";
      payload: { dice: number[]; playerId: number; type?: "starting" };
    }
  | {
      type: "game.turn";
      payload: { playerId: number; color: "white" | "black" };
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
      payload: IDataResponse<any>;
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
    }
  | {
      type: "game.undo";
      payload: { gameId: number };
    };
