import { Type } from "@sinclair/typebox";

export const RollDiceSchema = Type.Object({
  gameId: Type.String({ minLength: 1 }),
});
