import { Type, Static } from "@sinclair/typebox";

export const SimpleUserSchema = Type.Object({
  userName: Type.String({ minLength: 1, maxLength: 100 }),
});

export const RegisterSchema = Type.Object({
  userName: Type.String({ minLength: 3, maxLength: 50 }),
  password: Type.String({ minLength: 8, maxLength: 100 }),
  // fullName: Type.Optional(Type.String({ maxLength: 200 })),
  phoneNumber: Type.Optional(Type.String({ pattern: "^[0-9]{11}$" })),
  gender: Type.Optional(
    Type.Union([
      Type.Literal("MAN"),
      Type.Literal("WOMAN"),
      Type.Literal("OTHER"),
    ]),
  ),
});

export const LoginSchema = Type.Object({
  userName: Type.String({ minLength: 1 }),
  password: Type.String({ minLength: 1 }),
});

export const UpdateProfileSchema = Type.Object({
  // fullName: Type.Optional(Type.String({ maxLength: 200 })),
  provinceId: Type.Optional(Type.Number({ minimum: 1 })),
  cityId: Type.Optional(Type.Number({ minimum: 1 })),
  image: Type.Optional(Type.String({ maxLength: 500 })),
  phoneNumber: Type.Optional(Type.String({ pattern: "^[0-9]{11}$" })),
});

export const ChangePasswordSchema = Type.Object({
  oldPassword: Type.Optional(Type.String({ minLength: 6 })),
  newPassword: Type.String({ minLength: 6, maxLength: 16 }),
});

export type SimpleUserInput = Static<typeof SimpleUserSchema>;
export type RegisterInput = Static<typeof RegisterSchema>;
export type LoginInput = Static<typeof LoginSchema>;
export type UpdateProfileInput = Static<typeof UpdateProfileSchema>;
