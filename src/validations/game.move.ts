// game.move.ts
import { Type, Static } from "@sinclair/typebox";
import { SPECIAL_POSITIONS } from "@/game/types";

export const MovePieceSchema = Type.Object({
  gameId: Type.Number(),
  from: Type.Union([Type.Number(), Type.Literal(SPECIAL_POSITIONS.BAR)]),
  to: Type.Union([
    Type.Number(),
    Type.Literal(SPECIAL_POSITIONS.BEAR_OFF_WHITE),
    Type.Literal(SPECIAL_POSITIONS.BEAR_OFF_BLACK),
  ]),
  die: Type.Optional(Type.Number()),
});

// اسکیما برای آرایه حرکات
export const MoveArraySchema = Type.Array(MovePieceSchema);

export type MovePayload = Static<typeof MovePieceSchema>;
export type MoveArrayPayload = Static<typeof MoveArraySchema>;
