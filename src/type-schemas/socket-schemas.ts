import { Type, Static } from "@sinclair/typebox";

export const JoinPayload = Type.Object({
  gameId: Type.Number(),
  userId: Type.Number(),
});

export const RollPayload = Type.Object({
  gameId: Type.Number(),
});

export const MovePayload = Type.Object({
  gameId: Type.Number(),
  from: Type.Number(),
  to: Type.Number(),
  die: Type.Optional(Type.Number()),
  isUndo: Type.Optional(Type.Boolean()),
});

export const LeavePayload = Type.Object({
  gameId: Type.Number(),
});

export const ReadyPayload = Type.Object({
  gameId: Type.Number(),
});
export const EndTurnPayload = Type.Object({ gameId: Type.Number() });

export type JoinPayloadType = Static<typeof JoinPayload>;
export type RollPayloadType = Static<typeof RollPayload>;
export type MovePayloadType = Static<typeof MovePayload>;
export type LeavePayloadType = Static<typeof LeavePayload>;
export type ReadyPayloadType = Static<typeof ReadyPayload>;
export type EndTurnPayloadType = Static<typeof EndTurnPayload>;
