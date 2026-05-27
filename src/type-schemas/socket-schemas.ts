import { SPECIAL_POSITIONS } from "@/game/types";
import { Type, Static } from "@sinclair/typebox";

export const JoinPayload = Type.Object({
  gameId: Type.Number(),
});

export const RollPayload = Type.Object({
  gameId: Type.Number(),
});

export const MovePayload = Type.Object({
  gameId: Type.Number(),
  from: Type.Union([Type.Number(), Type.Literal(SPECIAL_POSITIONS.BAR)]),
  to: Type.Union([
    Type.Number(),
    Type.Literal(SPECIAL_POSITIONS.BEAR_OFF_WHITE),
    Type.Literal(SPECIAL_POSITIONS.BEAR_OFF_BLACK),
  ]),
});

export const LeavePayload = Type.Object({
  gameId: Type.Number(),
});

export type JoinPayloadType = Static<typeof JoinPayload>;
export type RollPayloadType = Static<typeof RollPayload>;
export type MovePayloadType = Static<typeof MovePayload>;
export type LeavePayloadType = Static<typeof LeavePayload>;
