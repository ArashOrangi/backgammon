// src/socket/protocol.ts
import { GameState } from "@/game/types";
import { IDataResponse } from "@/responses/ResponseStates";
import { TournamentGame } from "@prisma/client";

// ---------- Client Messages ----------
export type ClientMessage =
  // ===== بازی اصلی =====
  | { type: "game.join"; payload: { gameId: number; userId: number } }
  | { type: "game.roll"; payload: { gameId: number } }
  | {
      type: "game.move";
      payload: {
        gameId: number;
        from: number;
        to: number;
        die?: number;
        isUndo?: boolean;
      };
    }
  | { type: "player.leave"; payload: { gameId: number } }
  | { type: "player.ready"; payload: { gameId: number } }
  | { type: "game.endTurn"; payload: { gameId: number } }
  | { type: "game.cube.offer"; payload: { gameId: number } }
  | { type: "game.cube.respond"; payload: { gameId: number; accept: boolean } }
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
    }
  // ===== تورنمنت (کلاینت → سرور) =====
  | {
      type: "tournament.monthly.start";
      payload: { seasonId: number };
    }
  | {
      type: "tournament.monthly.record";
      payload: {
        seriesId: number;
        gameId: number;
        matchIndex: number;
        result: "normal" | "gammon" | "backgammon" | "loss" | "forfeit";
        pipAdvantage?: number;
        cleanPlay?: boolean;
      };
    }
  | {
      type: "tournament.monthly.close";
      payload: { seriesId: number };
    }
  | {
      type: "tournament.matchmaking.join";
      payload: { seasonId: number; type: "WEEKLY" | "MONTHLY" };
    }
  | {
      type: "tournament.matchmaking.cancel";
      payload: { type: "WEEKLY" | "MONTHLY" };
    };

// ---------- Server Messages ----------
export type ServerMessage =
  // ===== پاسخ‌های عمومی =====
  | { type: "game.state"; payload: IDataResponse<GameState> }
  | { type: "game.error"; payload: IDataResponse<any> }
  | { type: "game.legalMoves"; payload: IDataResponse<any> }

  // ===== رویدادهای جریان بازی =====
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
  | { type: "player.move"; payload: IDataResponse<MovePayload> }
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
    }

  // ===== تورنمنت – پاسخ‌های با نام یکسان + _res =====
  | {
      type: "tournament.monthly.start_res";
      payload: IDataResponse<{ seriesId: number; expiresAt: Date }>;
    }
  | {
      type: "tournament.monthly.record_res";
      payload: IDataResponse<TournamentGame>;
    }
  | {
      type: "tournament.monthly.close_res";
      payload: IDataResponse<{
        success: boolean;
        seriesId: number;
        status: string;
      }>;
    }
  | {
      type: "tournament.matchmaking.join_res";
      payload: IDataResponse<{ status: string }>;
    }
  | {
      type: "tournament.matchmaking.cancel_res";
      payload: IDataResponse<{ status: string }>;
    }

  // ===== رویدادهای یک‌طرفه سرور (بدون _res) =====
  | {
      type: "tournament.match_found";
      payload: IDataResponse<{
        gameId: number;
        opponent: { id: number; userName: string; avatar: string };
      }>;
    }
  | {
      type: "tournament.series_closed";
      payload: IDataResponse<{ seriesId: number; status: string }>;
    };

// ---------- MovePayload (مشترک) ----------
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
