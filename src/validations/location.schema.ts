import { Type, Static } from "@sinclair/typebox";

export const ProvinceIdSchema = Type.Object({
  provinceId: Type.Integer({ minimum: 1 }),
});

export type ProvinceIdInput = Static<typeof ProvinceIdSchema>;
