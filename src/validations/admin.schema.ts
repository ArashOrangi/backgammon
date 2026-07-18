import { Type, Static } from "@sinclair/typebox";
import { UsageType, ShopItemType, CurrencyType } from "@prisma/client";

// ---------- Inventory ----------
export const InventoryItemCreateSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 255 }),
  visualCode: Type.String({ minLength: 1, maxLength: 255 }),
  usageType: Type.Enum(UsageType),
});

export const InventoryItemUpdateSchema = Type.Partial(
  InventoryItemCreateSchema,
);

// ---------- Shop ----------
export const ShopItemCreateSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 255 }),
  description: Type.Optional(Type.String()),
  type: Type.Enum(ShopItemType),
  inventoryItemId: Type.Optional(Type.Integer({ minimum: 1 })),
  coinPrice: Type.Optional(Type.Integer({ minimum: 0 })),
  diamondPrice: Type.Optional(Type.Integer({ minimum: 0 })),
  realPrice: Type.Optional(Type.Number({ minimum: 0 })),
  realCurrency: Type.Optional(Type.String()),
  discountCoinPrice: Type.Optional(Type.Integer({ minimum: 0 })),
  discountDiamondPrice: Type.Optional(Type.Integer({ minimum: 0 })),
  discountRealPrice: Type.Optional(Type.Number({ minimum: 0 })),
  discountStartDate: Type.Optional(Type.String({ format: "date-time" })),
  discountEndDate: Type.Optional(Type.String({ format: "date-time" })),
  packageItems: Type.Optional(
    Type.Array(
      Type.Object({
        inventoryItemId: Type.Integer({ minimum: 1 }),
        amount: Type.Integer({ minimum: 1 }),
      }),
    ),
  ),
  packageCoin: Type.Optional(Type.Integer({ minimum: 0 })),
  packageDiamond: Type.Optional(Type.Integer({ minimum: 0 })),
  isActive: Type.Optional(Type.Boolean()),
  sortOrder: Type.Optional(Type.Integer({ minimum: 0 })),
  displayImage: Type.Optional(Type.String()),
});

export const ShopItemUpdateSchema = Type.Partial(ShopItemCreateSchema);

export const ShopItemToggleSchema = Type.Object({
  isActive: Type.Boolean(),
});

// ---------- Starter Packs ----------
export const ApplyStarterPackSchema = Type.Object({
  userId: Type.Integer({ minimum: 1 }),
  packId: Type.String({ minLength: 1 }),
});

// ---------- User Inventory (Admin) ----------
export const UserInventoryAddSchema = Type.Object({
  inventoryItemId: Type.Integer({ minimum: 1 }),
  amount: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
});

export const UserInventoryRemoveSchema = Type.Object({
  inventoryItemId: Type.Integer({ minimum: 1 }),
  amount: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
});

export const AddCoinSchema = Type.Object({
  amount: Type.Integer({ minimum: 1 }),
});

export const AddDiamondSchema = Type.Object({
  amount: Type.Integer({ minimum: 1 }),
});

// Types
export type InventoryItemCreateInput = Static<typeof InventoryItemCreateSchema>;
export type InventoryItemUpdateInput = Static<typeof InventoryItemUpdateSchema>;
export type ShopItemCreateInput = Static<typeof ShopItemCreateSchema>;
export type ShopItemUpdateInput = Static<typeof ShopItemUpdateSchema>;
export type ShopItemToggleInput = Static<typeof ShopItemToggleSchema>;
export type ApplyStarterPackInput = Static<typeof ApplyStarterPackSchema>;
export type UserInventoryAddInput = Static<typeof UserInventoryAddSchema>;
export type UserInventoryRemoveInput = Static<typeof UserInventoryRemoveSchema>;
export type AddCoinInput = Static<typeof AddCoinSchema>;
export type AddDiamondInput = Static<typeof AddDiamondSchema>;
