import { Type, Static } from "@sinclair/typebox";

export const TimerPresetCreateSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 255 }),
  primarySeconds: Type.Integer({ minimum: 1 }),
  secondarySeconds: Type.Integer({ minimum: 1 }),
  leagueLevel: Type.Optional(Type.Integer({ minimum: 0 })),
  gameType: Type.Optional(Type.String()),
  isDefault: Type.Optional(Type.Boolean()),
});

export const TimerPresetUpdateSchema = Type.Partial(TimerPresetCreateSchema);

export const TimerPresetIdSchema = Type.Object({
  id: Type.Integer({ minimum: 1 }),
});

export type TimerPresetCreateInput = Static<typeof TimerPresetCreateSchema>;
export type TimerPresetUpdateInput = Static<typeof TimerPresetUpdateSchema>;
export type TimerPresetIdInput = Static<typeof TimerPresetIdSchema>;
