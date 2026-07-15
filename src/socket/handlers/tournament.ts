import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import {
  onOkSocketResponse,
  onErrorSocketResponse,
} from "@/responses/response-builder";
import { MonthlyTournamentService } from "@/services/tournament/monthly";
import { WeeklyTournamentService } from "@/services/tournament/weekly";
import { TournamentMatchmaking } from "@/services/tournament/matchmaking";
import { TournamentType } from "@prisma/client";
import { GameQueue } from "@/game/gameQueue";

const monthlyService = new MonthlyTournamentService();
const weeklyService = new WeeklyTournamentService();
const matchmaking = new TournamentMatchmaking(monthlyService); // از همان سرویس پایه استفاده می‌کند

// ========== شروع سری ماهانه ==========
export async function handleStartMonthlySeries(
  ctx: SocketContext,
  payload: { seasonId: number },
  rooms: RoomManager,
) {
  if (!ctx.userId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Unauthenticated"),
    });
  }
  try {
    const result = await monthlyService.startSeries(
      ctx.userId,
      payload.seasonId,
    );
    return ctx.send({
      type: "tournament.monthly.series_started",
      payload: onOkSocketResponse(result),
    });
  } catch (err: any) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(err.message),
    });
  }
}

// ========== ثبت نتیجه مسابقه ماهانه ==========
export async function handleRecordMonthlyGame(
  ctx: SocketContext,
  payload: {
    seriesId: number;
    gameId: number;
    matchIndex: number;
    result: string;
    pipAdvantage?: number;
    cleanPlay?: boolean;
  },
  rooms: RoomManager,
) {
  try {
    const game = await monthlyService.recordGame(payload.seriesId, {
      gameId: payload.gameId,
      matchIndex: payload.matchIndex,
      result: payload.result as any,
      pipAdvantage: payload.pipAdvantage,
      cleanPlay: payload.cleanPlay,
    });
    return ctx.send({
      type: "tournament.monthly.game_recorded",
      payload: onOkSocketResponse(game),
    });
  } catch (err: any) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(err.message),
    });
  }
}

// ========== بستن سری ماهانه (دستی) ==========
export async function handleCloseMonthlySeries(
  ctx: SocketContext,
  payload: { seriesId: number },
  rooms: RoomManager,
) {
  try {
    await monthlyService.closeSeries(payload.seriesId, "CLOSED_BY_PLAYER");
    return ctx.send({
      type: "tournament.monthly.series_closed",
      payload: onOkSocketResponse({ success: true }),
    });
  } catch (err: any) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(err.message),
    });
  }
}

// ========== ثبت نتیجه بازی هفتگی ==========
export async function handleRecordWeeklyGame(
  ctx: SocketContext,
  payload: {
    seasonId: number;
    gameId: number;
    result: string;
    pipAdvantage?: number;
    cleanPlay?: boolean;
  },
  rooms: RoomManager,
) {
  try {
    if (!ctx.userId) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Unauthenticated"),
      });
    }
    const result = await weeklyService.recordGame(
      ctx.userId,
      payload.seasonId,
      {
        gameId: payload.gameId,
        result: payload.result as any,
        pipAdvantage: payload.pipAdvantage,
        cleanPlay: payload.cleanPlay,
      },
    );
    return ctx.send({
      type: "tournament.weekly.game_recorded",
      payload: onOkSocketResponse(result),
    });
  } catch (err: any) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(err.message),
    });
  }
}

// ========== ورود به صف مچ‌میکینگ ==========
export async function handleJoinTournamentQueue(
  ctx: SocketContext,
  payload: { seasonId: number; type: TournamentType },
  rooms: RoomManager,
) {
  try {
    if (!ctx.userId) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Unauthenticated"),
      });
    }
    await matchmaking.enqueue(ctx.userId, payload.seasonId, payload.type);
    return ctx.send({
      type: "tournament.matchmaking.joined",
      payload: onOkSocketResponse({ status: "searching" }),
    });
  } catch (err: any) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(err.message),
    });
  }
}

// ========== لغو صف ==========
export async function handleCancelTournamentQueue(
  ctx: SocketContext,
  payload: { seasonId: number; type: TournamentType },
  rooms: RoomManager,
) {
  if (!ctx.userId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Unauthenticated"),
    });
  }
  await matchmaking.cancelQueue(ctx.userId, payload.seasonId, payload.type);
  return ctx.send({
    type: "tournament.matchmaking.cancelled",
    payload: onOkSocketResponse({ status: "cancelled" }),
  });
}
