import { Type, Static } from "@sinclair/typebox";

export const GetHistorySchema = Type.Object({
  gameId: Type.Integer({ minimum: 1 }),
});

export const ReplaySchema = Type.Object({
  gameId: Type.Integer({ minimum: 1 }),
  until: Type.Optional(Type.Integer({ minimum: 0 })),
});

export const TimelineSchema = Type.Object({
  gameId: Type.Integer({ minimum: 1 }),
});

export type GetHistoryInput = Static<typeof GetHistorySchema>;
export type ReplayInput = Static<typeof ReplaySchema>;
export type TimelineInput = Static<typeof TimelineSchema>;
