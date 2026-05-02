import { GameState } from "@/game/types";

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
      payload: GameState;
    }
  | {
      type: "game.roll";
      payload: {
        dice: number[];
      };
    }
  | {
      type: "game.join";
      payload: {
        success: boolean;
        message: string;
        game?: GameState;
      };
    }
  | {
      type: "game.error";
      payload: {
        message: string;
      };
    };
