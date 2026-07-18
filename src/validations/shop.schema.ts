import { Type, Static } from "@sinclair/typebox";
import { CurrencyType } from "@prisma/client";

export const PurchaseRequestSchema = Type.Object({
  shopItemId: Type.Integer({ minimum: 1 }),
  currencyType: Type.Enum(CurrencyType),
  realAmount: Type.Optional(Type.Number({ minimum: 0 })),
  realCurrency: Type.Optional(Type.String()),
});

export type PurchaseRequestInput = Static<typeof PurchaseRequestSchema>;
