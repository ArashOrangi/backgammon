import { Type } from "@sinclair/typebox";

export const RollDiceSchema = Type.Object({
  gameId: Type.Number({ minimum: 1 }),
});
