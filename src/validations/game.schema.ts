import { Type, Static } from "@sinclair/typebox";
import { RoomType } from "@prisma/client";

export const CreateGameSchema = Type.Object({
  whitePlayerId: Type.Integer({ minimum: 1 }),
});

export const JoinGameSchema = Type.Object({
  userId: Type.Integer({ minimum: 1 }),
  roomType: Type.Optional(Type.Enum(RoomType)),
});

export type CreateGameInput = Static<typeof CreateGameSchema>;
export type JoinGameInput = Static<typeof JoinGameSchema>;
