import { Type, Static } from "@sinclair/typebox";

export const SimpleUserSchema = Type.Object({
  userName: Type.String({ minLength: 1, maxLength: 100 }),
});

export const RegisterSchema = Type.Object({
  userName: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
  fullName: Type.Optional(Type.String({ maxLength: 200 })),
  provinceId: Type.Optional(Type.Number({ minimum: 1 })),
  cityId: Type.Optional(Type.Number({ minimum: 1 })),
  image: Type.Optional(Type.String({ maxLength: 500 })),
  mobile: Type.Optional(
    Type.String({ pattern: "^[0-9]{11}$", maxLength: 11, minLength: 11 }),
  ),
  gender: Type.Optional(
    Type.Union([
      Type.Literal("MAN"),
      Type.Literal("WOMAN"),
      Type.Literal("OTHER"),
    ]),
  ),
});

export const UpdateProfileSchema = Type.Object({
  fullName: Type.Optional(Type.String({ maxLength: 200 })),
  provinceId: Type.Optional(Type.Number({ minimum: 1 })),
  cityId: Type.Optional(Type.Number({ minimum: 1 })),
  image: Type.Optional(Type.String({ maxLength: 500 })),
  mobile: Type.Optional(
    Type.String({ pattern: "^[0-9]{11}$", maxLength: 11, minLength: 11 }),
  ),
});

export type SimpleUserInput = Static<typeof SimpleUserSchema>;
export type RegisterInput = Static<typeof RegisterSchema>;
export type UpdateProfileInput = Static<typeof UpdateProfileSchema>;
