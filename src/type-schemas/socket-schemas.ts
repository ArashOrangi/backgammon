import { Type, Static } from "@sinclair/typebox";

export const JoinPayload = Type.Object({
  gameId: Type.String(),
});

export const RollPayload = Type.Object({
  gameId: Type.String(),
});

export const MovePayload = Type.Object({
  gameId: Type.String(),
  from: Type.Union([Type.Number(), Type.Literal("bar")]),
  to: Type.Union([Type.Number(), Type.Literal("off")]),
});

export const LeavePayload = Type.Object({
  gameId: Type.String(),
});

export type JoinPayloadType = Static<typeof JoinPayload>;
export type RollPayloadType = Static<typeof RollPayload>;
export type MovePayloadType = Static<typeof MovePayload>;
export type LeavePayloadType = Static<typeof LeavePayload>;
