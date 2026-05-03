import { GameState } from "@/game/types";
import { IDataResponse } from "@/responses/ResponseStates";

export type ClientMessage =
  | {
      type: "game.join";
      payload: {
        gameId: string;
      };
    }
  | {
      type: "game.roll";
      payload: {
        gameId: string;
      };
    }
  | {
      type: "game.move";
      payload: {
        gameId: string;
        from: number | "bar";
        to: number | "off";
      };
    }
  | {
      type: "player.leave";
      payload: {
        gameId: string;
      };
    };

export type ServerMessage =
  | {
      type: "game.state";
      payload: IDataResponse<GameState, undefined>;
    }
  | {
      type: "game.roll";
      payload: IDataResponse<{ dice: number[] }, undefined>;
    }
  | {
      type: "game.join";
      payload: IDataResponse<GameState, undefined>;
    }
  | {
      type: "game.error";
      payload: IDataResponse<unknown, unknown>;
    };
