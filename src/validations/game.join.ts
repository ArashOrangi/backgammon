import { Type } from "@sinclair/typebox";
import { RoomType } from "@/models/matchmaking";

export const JoinGameSchema = Type.Object({
  gameId: Type.Number({ minimum: 1 }),
  userId: Type.Number({ minimum: 1 }),
  roomType: Type.Optional(Type.Enum(RoomType)),
});
