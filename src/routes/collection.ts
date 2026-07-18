// src/routes/collection.ts
import { Hono } from "hono";
import { IMiddlewareAuth } from "@/models/middleware";
import {
  onOkRestResponse,
  onErrorRestResponse,
  onValidationsRestResponse,
} from "@/responses/response-builder";
import { middlewareAuth } from "@/middlewares/middlewareAuth";
import {
  getUserCollection,
  selectItem,
  getUserSelectedItems,
} from "@/services/collection";
import { validator } from "@/components/validator";
import { SelectItemSchema } from "@/validations/collection.schema";

export const collectionRoutes = new Hono<IMiddlewareAuth>();

/**
 * GET /collection/items
 * دریافت کلکسیون کاربر (همه آیتم‌های مالکیت‌شده)
 */
collectionRoutes.get("/items", middlewareAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Not authenticated" });
  }

  try {
    const collection = await getUserCollection(user.id);
    return onOkRestResponse({ ctx: c, data: collection });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch collection",
    });
  }
});

/**
 * POST /collection/select
 * انتخاب یک آیتم از کلکسیون برای استفاده
 * Body: { inventoryItemId: number, category: "dice"|"checker"|"cup"|"board"|"sticker"|"avatar"|"frame" }
 */
collectionRoutes.post("/select", middlewareAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Not authenticated" });
  }

  try {
    const body = await c.req.json();
    const validation = validator({ data: body, schema: SelectItemSchema });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: c,
        validations: validation.errors,
      });
    }

    const { inventoryItemId, category } = validation.data;

    await selectItem(user.id, inventoryItemId, category);
    return onOkRestResponse({
      ctx: c,
      data: { success: true },
      message: "Item selected successfully",
    });
  } catch (error: any) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: error.message || "Failed to select item",
    });
  }
});

/**
 * GET /collection/selected
 * دریافت آیتم‌های انتخابی فعلی کاربر
 */
collectionRoutes.get("/selected", middlewareAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Not authenticated" });
  }

  try {
    const selected = await getUserSelectedItems(user.id);
    return onOkRestResponse({ ctx: c, data: selected });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch selected items",
    });
  }
});
