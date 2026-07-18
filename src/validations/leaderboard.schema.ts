import { Type, Static } from "@sinclair/typebox";

export const LeaderboardQuerySchema = Type.Object({
  limit: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 500, default: 100 }),
  ),
});

export const TournamentLeaderboardSchema = Type.Object({
  tournamentId: Type.Integer({ minimum: 1 }),
});

export type LeaderboardQueryInput = Static<typeof LeaderboardQuerySchema>;
export type TournamentLeaderboardInput = Static<
  typeof TournamentLeaderboardSchema
>;
