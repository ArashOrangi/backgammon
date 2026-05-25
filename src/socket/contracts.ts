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
  "game.error": (data: { message: string }) => void;

  // ایونت‌های اختصاصی لیست مدیر فنی
  "player.assign": (data: {
    color: "white" | "black";
    playerId: string;
  }) => void;
  "room.ready": (data: { gameId: string }) => void;
  "game.turn": (data: { playerId: string; color: "white" | "black" }) => void;
  "dice.result": (data: { dice: number[]; playerId: string }) => void;
  "turn.timeout": (data: { playerId: string }) => void;
  "network.timeout": (data: { playerId: string }) => void;
  "game.result": (data: { winner: string; reason: string }) => void;
  // ... بقیه ایونت‌ها مثل move
}
