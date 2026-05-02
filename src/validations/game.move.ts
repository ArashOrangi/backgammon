import { Literal, Static, Type, Union } from "@sinclair/typebox";

export const MovePieceSchema = Type.Object({
  gameId: Type.String(),
  from: Union([Type.Number(), Literal("bar")]),
  to: Union([Type.Number(), Literal("off")]),
});

export type MovePayload = Static<typeof MovePieceSchema>;
