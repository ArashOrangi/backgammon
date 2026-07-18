import { Type, Static } from "@sinclair/typebox";

export const CategoryCreateSchema = Type.Object({
  nameFa: Type.String({ minLength: 1, maxLength: 255 }),
  nameEn: Type.Optional(Type.String()),
  isFree: Type.Optional(Type.Boolean()),
  conditions: Type.Optional(Type.Object({})),
  lock: Type.Optional(Type.Boolean()),
  isActive: Type.Optional(Type.Boolean()),
});

export const CategoryUpdateSchema = Type.Partial(CategoryCreateSchema);

export const CategoryIdSchema = Type.Object({
  id: Type.Integer({ minimum: 1 }),
});

export const MessageCreateSchema = Type.Object({
  message: Type.String({ minLength: 1 }),
  categoryId: Type.Integer({ minimum: 1 }),
  order: Type.Optional(Type.Integer({ minimum: 0 })),
  isActive: Type.Optional(Type.Boolean()),
});

export const MessageUpdateSchema = Type.Partial(
  Type.Omit(MessageCreateSchema, ["categoryId"]),
);

export const MessageIdSchema = Type.Object({
  id: Type.Integer({ minimum: 1 }),
});

export const CategoryMessagesSchema = Type.Object({
  categoryId: Type.Integer({ minimum: 1 }),
});

export type CategoryCreateInput = Static<typeof CategoryCreateSchema>;
export type CategoryUpdateInput = Static<typeof CategoryUpdateSchema>;
export type CategoryIdInput = Static<typeof CategoryIdSchema>;
export type MessageCreateInput = Static<typeof MessageCreateSchema>;
export type MessageUpdateInput = Static<typeof MessageUpdateSchema>;
export type MessageIdInput = Static<typeof MessageIdSchema>;
export type CategoryMessagesInput = Static<typeof CategoryMessagesSchema>;
