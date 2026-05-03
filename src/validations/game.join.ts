import { Type } from "@sinclair/typebox";

export const JoinGameSchema = Type.Object({
  gameId: Type.String({ minLength: 1 }),
});
