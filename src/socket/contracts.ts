import type { GameState } from "../game/types";

export interface ClientToServerEvents {
  "game.join": (data: { gameId: string }) => void;
  "game.roll": (data: { gameId: string }) => void;
  "game.move": (data: {
    gameId: string;
    from: number; // before: number | "bar"
    to: number; // before: number | "off"
  }) => void;
  "player.leave": (data: { gameId: string }) => void;
}

export interface ServerToClientEvents {
  "game.state": (state: GameState) => void;
  "game.roll": (data: { dice: number[] }) => void;
  "game.join": (data: {
    success: boolean;
    message: string;
    game?: GameState;
  }) => void;
  "game.error": (data: { message: string }) => void;
}
