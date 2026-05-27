import type { GameState } from "../game/types";

export interface ClientToServerEvents {
  "game.join": (data: { gameId: number }) => void;
  "game.roll": (data: { gameId: number }) => void;
  "game.move": (data: {
    gameId: number;
    from: number; // before: number | "bar"
    to: number; // before: number | "off"
  }) => void;
  "player.leave": (data: { gameId: number }) => void;
}

export interface ServerToClientEvents {
  "game.state": (state: GameState) => void;
  "game.error": (data: { message: string }) => void;
  "player.assign": (data: {
    color: "white" | "black";
    playerId: number;
  }) => void;
  "room.ready": (data: { gameId: number }) => void;
  "game.turn": (data: { playerId: number; color: "white" | "black" }) => void;
  "dice.result": (data: { dice: number[]; playerId: number }) => void;
  "turn.timeout": (data: { playerId: number }) => void;
  "network.timeout": (data: { playerId: number }) => void;
  "game.result": (data: { winner: string; reason: string }) => void;
  // ... بقیه ایونت‌ها مثل move
}
