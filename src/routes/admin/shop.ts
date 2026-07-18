import { Hono } from "hono";
import {
  onOkRestResponse,
  onErrorRestResponse,
  onValidationsRestResponse,
} from "@/responses/response-builder";
import { middlewareAuth } from "@/middlewares/middlewareAuth";
import { adminGuard } from "@/middlewares/adminGuard";
import { ShopAdminService } from "@/services/admin/shop-admin.service";
import { validator } from "@/components/validator";
import {
  ShopItemCreateSchema,
  ShopItemUpdateSchema,
  ShopItemToggleSchema,
} from "@/validations/admin.schema";

const shopAdminRoutes = new Hono();
const service = new ShopAdminService();

// ===== دریافت لیست آیتم‌های فروشگاهی =====
shopAdminRoutes.get("/", middlewareAuth, adminGuard, async (c) => {
  const includeInactive = c.req.query("includeInactive") === "true";
  try {
    const items = await service.getAllItems(includeInactive);
    return onOkRestResponse({ ctx: c, data: items });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch shop items",
    });
  }
});

// ===== دریافت آیتم فروشگاهی با ID =====
shopAdminRoutes.get("/:id", middlewareAuth, adminGuard, async (c) => {
  const id = Number(c.req.param("id"));
  if (isNaN(id) || id < 1) {
    return onValidationsRestResponse({
      ctx: c,
      validations: { id: ["Must be a positive integer"] },
    });
  }

  try {
    const item = await service.getItem(id);
    if (!item) {
      return onErrorRestResponse({
        ctx: c,
        errorMessage: "Shop item not found",
      });
    }
    return onOkRestResponse({ ctx: c, data: item });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch shop item",
    });
  }
});

// ===== ایجاد آیتم فروشگاهی =====
shopAdminRoutes.post("/", middlewareAuth, adminGuard, async (c) => {
  const body = await c.req.json();
  const validation = validator({ data: body, schema: ShopItemCreateSchema });
  if (!validation.isValid) {
    return onValidationsRestResponse({
      ctx: c,
      validations: validation.errors,
    });
  }

  // تبدیل تاریخ‌ها از string به Date
  const data = {
    ...validation.data,
    discountStartDate: validation.data.discountStartDate
      ? new Date(validation.data.discountStartDate)
      : undefined,
    discountEndDate: validation.data.discountEndDate
      ? new Date(validation.data.discountEndDate)
      : undefined,
  };

  try {
    const item = await service.createItem(data);
    return onOkRestResponse({
      ctx: c,
      data: item,
      message: "Shop item created successfully",
    });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to create shop item",
    });
  }
});

// ===== بروزرسانی آیتم فروشگاهی =====
shopAdminRoutes.put("/:id", middlewareAuth, adminGuard, async (c) => {
  const id = Number(c.req.param("id"));
  if (isNaN(id) || id < 1) {
    return onValidationsRestResponse({
      ctx: c,
      validations: { id: ["Must be a positive integer"] },
    });
  }

  const body = await c.req.json();
  const validation = validator({ data: body, schema: ShopItemUpdateSchema });
  if (!validation.isValid) {
    return onValidationsRestResponse({
      ctx: c,
      validations: validation.errors,
    });
  }

  // تبدیل تاریخ‌ها از string به Date
  const data = {
    ...validation.data,
    discountStartDate: validation.data.discountStartDate
      ? new Date(validation.data.discountStartDate)
      : undefined,
    discountEndDate: validation.data.discountEndDate
      ? new Date(validation.data.discountEndDate)
      : undefined,
  };

  try {
    const item = await service.updateItem(id, data);
    return onOkRestResponse({
      ctx: c,
      data: item,
      message: "Shop item updated successfully",
    });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to update shop item",
    });
  }
});

// ===== حذف آیتم فروشگاهی =====
shopAdminRoutes.delete("/:id", middlewareAuth, adminGuard, async (c) => {
  const id = Number(c.req.param("id"));
  if (isNaN(id) || id < 1) {
    return onValidationsRestResponse({
      ctx: c,
      validations: { id: ["Must be a positive integer"] },
    });
  }

  try {
    await service.deleteItem(id);
    return onOkRestResponse({
      ctx: c,
      data: { success: true },
      message: "Shop item deleted successfully",
    });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to delete shop item",
    });
  }
});

// ===== تغییر وضعیت فعال/غیرفعال =====
shopAdminRoutes.patch("/:id/toggle", middlewareAuth, adminGuard, async (c) => {
  const id = Number(c.req.param("id"));
  if (isNaN(id) || id < 1) {
    return onValidationsRestResponse({
      ctx: c,
      validations: { id: ["Must be a positive integer"] },
    });
  }

  const body = await c.req.json();
  const validation = validator({ data: body, schema: ShopItemToggleSchema });
  if (!validation.isValid) {
    return onValidationsRestResponse({
      ctx: c,
      validations: validation.errors,
    });
  }

  try {
    const item = await service.toggleActive(id, validation.data.isActive);
    return onOkRestResponse({
      ctx: c,
      data: item,
      message: `Shop item ${validation.data.isActive ? "activated" : "deactivated"} successfully`,
    });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to toggle shop item",
    });
  }
});

export { shopAdminRoutes };
