// game.move.ts
import { Type, Static } from "@sinclair/typebox";
import { SPECIAL_POSITIONS } from "@/game/types";

export const BoardPointSchema = Type.Integer({
  minimum: 0,
  maximum: 23,
});

export const FromPositionSchema = Type.Union([
  BoardPointSchema,
  Type.Literal(SPECIAL_POSITIONS.BAR),
]);

export const ToPositionSchema = Type.Union([
  BoardPointSchema,
  Type.Literal(SPECIAL_POSITIONS.BEAR_OFF_WHITE),
  Type.Literal(SPECIAL_POSITIONS.BEAR_OFF_BLACK),
]);

export const MovePieceSchema = Type.Object({
  gameId: Type.Integer({
    minimum: 1,
  }),

  /**
   * from:
   * - 0..23 برای نقطه‌های تخته
   * - BAR برای ورود مهره از بار
   */
  from: FromPositionSchema,

  /**
   * to:
   * - 0..23 برای نقطه‌های تخته
   * - BEAR_OFF_WHITE / BEAR_OFF_BLACK برای bear off
   *
   * نکته مهم:
   * BAR نباید مقصد مستقیم payload کلاینت باشد.
   * رفتن مهره‌ی حریف به BAR فقط نتیجه‌ی hit در engine است.
   */
  to: ToPositionSchema,

  die: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 6,
    }),
  ),
});

export const MoveArraySchema = Type.Array(MovePieceSchema, {
  minItems: 1,
});

export type MovePayload = Static<typeof MovePieceSchema>;
export type MoveArrayPayload = Static<typeof MoveArraySchema>;
