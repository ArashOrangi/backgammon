import { RoomType } from "@prisma/client";
import { Type } from "@sinclair/typebox";

export const JoinGameSchema = Type.Object({
  gameId: Type.Number({ minimum: 1 }),
  userId: Type.Number({ minimum: 1 }),
  roomType: Type.Optional(Type.Enum(RoomType)),
});
