import { Type, Static } from "@sinclair/typebox";
import { TournamentType, MatchResultType } from "@prisma/client";

// ---------- REST ----------
export const GetCurrentSeasonSchema = Type.Object({
  type: Type.Enum(TournamentType),
});

export const GetLeaderboardSchema = Type.Object({
  seasonId: Type.Integer({ minimum: 1 }),
  limit: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 500, default: 100 }),
  ),
});

export const GetMonthlyHistorySchema = Type.Object({
  playerId: Type.Integer({ minimum: 1 }),
  seasonId: Type.Optional(Type.Integer({ minimum: 1 })),
});

// ---------- WebSocket ----------
export const TournamentMatchmakingJoinSchema = Type.Object({
  seasonId: Type.Integer({ minimum: 1 }),
  type: Type.Enum(TournamentType),
});

export const TournamentMatchmakingCancelSchema = Type.Object({
  type: Type.Enum(TournamentType),
});

export const StartMonthlySeriesSchema = Type.Object({
  seasonId: Type.Integer({ minimum: 1 }),
});

export const RecordMonthlyGameSchema = Type.Object({
  seriesId: Type.Integer({ minimum: 1 }),
  gameId: Type.Integer({ minimum: 1 }),
  matchIndex: Type.Integer({ minimum: 0, maximum: 2 }),
  result: Type.Enum(MatchResultType),
  pipAdvantage: Type.Optional(Type.Number({ minimum: 0 })),
  cleanPlay: Type.Optional(Type.Boolean()),
});

export const CloseMonthlySeriesSchema = Type.Object({
  seriesId: Type.Integer({ minimum: 1 }),
});

// Types
export type GetCurrentSeasonInput = Static<typeof GetCurrentSeasonSchema>;
export type GetLeaderboardInput = Static<typeof GetLeaderboardSchema>;
export type GetMonthlyHistoryInput = Static<typeof GetMonthlyHistorySchema>;
export type TournamentMatchmakingJoinInput = Static<
  typeof TournamentMatchmakingJoinSchema
>;
export type TournamentMatchmakingCancelInput = Static<
  typeof TournamentMatchmakingCancelSchema
>;
export type StartMonthlySeriesInput = Static<typeof StartMonthlySeriesSchema>;
export type RecordMonthlyGameInput = Static<typeof RecordMonthlyGameSchema>;
export type CloseMonthlySeriesInput = Static<typeof CloseMonthlySeriesSchema>;
