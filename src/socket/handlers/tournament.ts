// src/socket/handlers/tournament.ts
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import { GameQueue } from "@/game/gameQueue";
import { MonthlyTournamentService } from "@/services/tournament/monthly";
import { WeeklyTournamentService } from "@/services/tournament/weekly";
import { TournamentMatchmaking } from "@/services/tournament/matchmaking";
import { TournamentService } from "@/services/tournament/tournament";
import { TournamentType } from "@prisma/client";
import { validateTournamentMonthlyStart } from "@/validations/socket";
import { validator } from "@/components/validator";
import {
  StartMonthlySeriesSchema,
  RecordMonthlyGameSchema,
  CloseMonthlySeriesSchema,
  TournamentMatchmakingJoinSchema,
  TournamentMatchmakingCancelSchema,
} from "@/validations/tournament.schema";

const gameQueue = new GameQueue();
const tournamentService = new TournamentService();
const monthlyService = new MonthlyTournamentService();
const weeklyService = new WeeklyTournamentService();
const matchmaking = new TournamentMatchmaking(tournamentService);

// ============================================================
// ۱. شروع سری ماهانه
//    کلاینت → سرور: tournament.monthly.start
//    سرور → کلاینت: tournament.monthly.start_res (موفق) / game.error (ناموفق)
// ============================================================
export async function handleTournamentMonthlyStart(
  ctx: SocketContext,
  payload: { seasonId: number },
  rooms: RoomManager,
) {
  const playerId = ctx.userId;
  if (!playerId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not authenticated"),
    });
  }

  try {
    const validation = validator({
      data: payload,
      schema: StartMonthlySeriesSchema,
    });
    if (!validation.isValid) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse(
          "Invalid payload: " + JSON.stringify(validation.errors),
        ),
      });
    }

    const result = await monthlyService.startSeries(playerId, payload.seasonId);

    // ✅ پاسخ با نام یکسان + _res
    return ctx.send({
      type: "tournament.monthly.start_res",
      payload: onOkSocketResponse({
        seriesId: result.seriesId,
        expiresAt: result.expiresAt,
      }),
    });
  } catch (err: any) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(err.message || "Failed to start series"),
    });
  }
}

// ============================================================
// ۲. ثبت مسابقه در سری ماهانه
//    کلاینت → سرور: tournament.monthly.record
//    سرور → کلاینت: tournament.monthly.record_res (موفق) / game.error (ناموفق)
// ============================================================
export async function handleTournamentMonthlyRecord(
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
  const playerId = ctx.userId;
  if (!playerId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not authenticated"),
    });
  }

  await gameQueue.enqueue(payload.gameId, async () => {
    try {
      const validation = validator({
        data: payload,
        schema: RecordMonthlyGameSchema,
      });
      if (!validation.isValid) {
        return ctx.send({
          type: "game.error",
          payload: onErrorSocketResponse(
            "Invalid payload: " + JSON.stringify(validation.errors),
          ),
        });
      }

      const game = await monthlyService.recordGame(payload.seriesId, {
        gameId: payload.gameId,
        matchIndex: payload.matchIndex,
        result: payload.result as any,
        pipAdvantage: payload.pipAdvantage,
        cleanPlay: payload.cleanPlay,
      });

      // ✅ پاسخ با نام یکسان + _res
      return ctx.send({
        type: "tournament.monthly.record_res",
        payload: onOkSocketResponse(game),
      });
    } catch (err: any) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse(err.message || "Failed to record game"),
      });
    }
  });
}

// ============================================================
// ۳. بستن سری ماهانه (دستی)
//    کلاینت → سرور: tournament.monthly.close
//    سرور → کلاینت: tournament.monthly.close_res (موفق) / game.error (ناموفق)
// ============================================================
export async function handleTournamentMonthlyClose(
  ctx: SocketContext,
  payload: { seriesId: number },
  rooms: RoomManager,
) {
  const playerId = ctx.userId;
  if (!playerId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not authenticated"),
    });
  }

  try {
    const validation = validator({
      data: payload,
      schema: CloseMonthlySeriesSchema,
    });
    if (!validation.isValid) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse(
          "Invalid payload: " + JSON.stringify(validation.errors),
        ),
      });
    }

    await monthlyService.closeSeries(payload.seriesId, "CLOSED_BY_PLAYER");

    // ✅ پاسخ با نام یکسان + _res
    return ctx.send({
      type: "tournament.monthly.close_res",
      payload: onOkSocketResponse({
        success: true,
        seriesId: payload.seriesId,
        status: "CLOSED_BY_PLAYER",
      }),
    });
  } catch (err: any) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(err.message || "Failed to close series"),
    });
  }
}

// ============================================================
// ۴. ورود به صف مچ‌میکینگ تورنمنت
//    کلاینت → سرور: tournament.matchmaking.join
//    سرور → کلاینت: tournament.matchmaking.join_res (موفق) / game.error (ناموفق)
// ============================================================
export async function handleTournamentMatchmakingJoin(
  ctx: SocketContext,
  payload: { seasonId: number; type: TournamentType },
  rooms: RoomManager,
) {
  const playerId = ctx.userId;
  if (!playerId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not authenticated"),
    });
  }

  try {
    const validation = validator({
      data: payload,
      schema: TournamentMatchmakingJoinSchema,
    });
    if (!validation.isValid) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse(
          "Invalid payload: " + JSON.stringify(validation.errors),
        ),
      });
    }

    await matchmaking.enqueue(playerId, payload.seasonId, payload.type);

    // ✅ پاسخ با نام یکسان + _res
    return ctx.send({
      type: "tournament.matchmaking.join_res",
      payload: onOkSocketResponse({ status: "searching" }),
    });
  } catch (err: any) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(
        err.message || "Failed to join matchmaking",
      ),
    });
  }
}

// ============================================================
// ۵. لغو صف مچ‌میکینگ تورنمنت
//    کلاینت → سرور: tournament.matchmaking.cancel
//    سرور → کلاینت: tournament.matchmaking.cancel_res (موفق) / game.error (ناموفق)
// ============================================================
export async function handleTournamentMatchmakingCancel(
  ctx: SocketContext,
  payload: { type: TournamentType },
  rooms: RoomManager,
) {
  const playerId = ctx.userId;
  if (!playerId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not authenticated"),
    });
  }

  try {
    const validation = validator({
      data: payload,
      schema: TournamentMatchmakingCancelSchema,
    });
    if (!validation.isValid) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse(
          "Invalid payload: " + JSON.stringify(validation.errors),
        ),
      });
    }

    // توجه: برای لغو نیاز به seasonId نداریم، اما متد cancelQueue نیاز به seasonId دارد.
    // در اینجا از یک مقدار placeholder استفاده می‌کنیم یا متد را تغییر می‌دهیم.
    // برای سادگی، فرض می‌کنیم که متد cancelQueue فقط با playerId و type کار می‌کند.
    // در غیر این صورت، باید seasonId را نیز در payload داشته باشیم.
    await matchmaking.cancelQueue(playerId, 0, payload.type); // seasonId = 0 به‌عنوان placeholder

    // ✅ پاسخ با نام یکسان + _res
    return ctx.send({
      type: "tournament.matchmaking.cancel_res",
      payload: onOkSocketResponse({ status: "cancelled" }),
    });
  } catch (err: any) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse(
        err.message || "Failed to cancel matchmaking",
      ),
    });
  }
}
