import { Hono } from "hono";
import {
  onOkRestResponse,
  onErrorRestResponse,
  onValidationsRestResponse,
} from "@/responses/response-builder";
import { middlewareAuth } from "@/middlewares/middlewareAuth";
import { adminGuard } from "@/middlewares/adminGuard";
import { InventoryAdminService } from "@/services/admin/inventory-admin.service";
import { validator } from "@/components/validator";
import {
  InventoryItemCreateSchema,
  InventoryItemUpdateSchema,
} from "@/validations/admin.schema";

const inventoryAdminRoutes = new Hono();
const service = new InventoryAdminService();

// ===== دریافت لیست تمام آیتم‌ها =====
inventoryAdminRoutes.get("/", middlewareAuth, adminGuard, async (c) => {
  try {
    const items = await service.getAllItems();
    return onOkRestResponse({ ctx: c, data: items });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch inventory items",
    });
  }
});

// ===== دریافت آیتم با ID =====
inventoryAdminRoutes.get("/:id", middlewareAuth, adminGuard, async (c) => {
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
      return onErrorRestResponse({ ctx: c, errorMessage: "Item not found" });
    }
    return onOkRestResponse({ ctx: c, data: item });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch item",
    });
  }
});

// ===== ایجاد آیتم جدید =====
inventoryAdminRoutes.post("/", middlewareAuth, adminGuard, async (c) => {
  const body = await c.req.json();
  const validation = validator({
    data: body,
    schema: InventoryItemCreateSchema,
  });
  if (!validation.isValid) {
    return onValidationsRestResponse({
      ctx: c,
      validations: validation.errors,
    });
  }

  try {
    const item = await service.createItem(validation.data);
    return onOkRestResponse({
      ctx: c,
      data: item,
      message: "Item created successfully",
    });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to create item",
    });
  }
});

// ===== بروزرسانی آیتم =====
inventoryAdminRoutes.put("/:id", middlewareAuth, adminGuard, async (c) => {
  const id = Number(c.req.param("id"));
  if (isNaN(id) || id < 1) {
    return onValidationsRestResponse({
      ctx: c,
      validations: { id: ["Must be a positive integer"] },
    });
  }

  const body = await c.req.json();
  const validation = validator({
    data: body,
    schema: InventoryItemUpdateSchema,
  });
  if (!validation.isValid) {
    return onValidationsRestResponse({
      ctx: c,
      validations: validation.errors,
    });
  }

  try {
    const item = await service.updateItem(id, validation.data);
    return onOkRestResponse({
      ctx: c,
      data: item,
      message: "Item updated successfully",
    });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to update item",
    });
  }
});

// ===== حذف آیتم =====
inventoryAdminRoutes.delete("/:id", middlewareAuth, adminGuard, async (c) => {
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
      message: "Item deleted successfully",
    });
  } catch (error: any) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: error.message || "Failed to delete item",
    });
  }
});

export { inventoryAdminRoutes };
