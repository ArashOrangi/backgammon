import { Type, Static } from "@sinclair/typebox";

// دسته‌بندی‌های مجاز برای انتخاب آیتم
const categories = [
  "dice",
  "checker",
  "cup",
  "board",
  "sticker",
  "avatar",
  "frame",
] as const;
export type Category = (typeof categories)[number];

/**
 * Schema اعتبارسنجی برای انتخاب آیتم (POST /collection/select)
 */
export const SelectItemSchema = Type.Object({
  inventoryItemId: Type.Integer({ minimum: 1 }),
  category: Type.Union(categories.map((c) => Type.Literal(c))),
});

export type SelectItemInput = Static<typeof SelectItemSchema>;
