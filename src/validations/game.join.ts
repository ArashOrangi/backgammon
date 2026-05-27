import { Type } from "@sinclair/typebox";

export const JoinGameSchema = Type.Object({
  gameId: Type.Number({ minimum: 1 }),
});
