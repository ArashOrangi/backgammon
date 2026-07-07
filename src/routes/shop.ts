//
import { Hono } from "hono";
import { IMiddlewareAuth } from "@/models/middleware";
import {
  onOkRestResponse,
  onErrorRestResponse,
  onValidationsRestResponse,
} from "@/responses/response-builder";
import { middlewareAuth } from "@/middlewares/middlewareAuth";
import { getShopItems, purchaseShopItem } from "@/services/shop";
import { CurrencyType } from "@prisma/client";

export const shopRoutes = new Hono<IMiddlewareAuth>();

/**
 * GET /shop/items
 * دریافت لیست آیتم‌های فروشگاه
 */
shopRoutes.get("/items", middlewareAuth, async (c) => {
  try {
    const items = await getShopItems();
    return onOkRestResponse({ ctx: c, data: items });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch shop items",
    });
  }
});

/**
 * POST /shop/purchase
 * خرید آیتم از فروشگاه
 * Body: { shopItemId: number, currencyType: "COIN"|"DIAMOND"|"REAL", realAmount?: number, realCurrency?: string }
 */
shopRoutes.post("/purchase", middlewareAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Not authenticated" });
  }

  try {
    const body = await c.req.json();
    const { shopItemId, currencyType, realAmount, realCurrency } = body;

    if (!shopItemId || !currencyType) {
      return onValidationsRestResponse({
        ctx: c,
        validations: {
          shopItemId: ["Required"],
          currencyType: ["Required"],
        },
      });
    }

    // اعتبارسنجی نوع ارز
    if (!Object.values(CurrencyType).includes(currencyType)) {
      return onValidationsRestResponse({
        ctx: c,
        validations: { currencyType: ["Invalid currency type"] },
      });
    }

    const transaction = await purchaseShopItem(
      user.id,
      shopItemId,
      currencyType,
      realAmount,
      realCurrency,
    );

    return onOkRestResponse({
      ctx: c,
      data: transaction,
      message: "Purchase successful",
    });
  } catch (error: any) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: error.message || "Purchase failed",
    });
  }
});
