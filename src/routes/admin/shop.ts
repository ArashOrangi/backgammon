import { Hono } from "hono";
import {
  onOkRestResponse,
  onErrorRestResponse,
  onValidationsRestResponse,
} from "@/responses/response-builder";
import { middlewareAuth } from "@/middlewares/middlewareAuth";
import { adminGuard } from "@/middlewares/adminGuard";
import { ShopAdminService } from "@/services/admin/shop-admin.service";

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
  const { name, type, inventoryItemId, coinPrice, diamondPrice, realPrice } =
    body;

  if (!name || !type) {
    return onValidationsRestResponse({
      ctx: c,
      validations: {
        name: ["Required"],
        type: ["Required"],
      },
    });
  }

  try {
    const item = await service.createItem(body);
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
  const body = await c.req.json();

  try {
    const item = await service.updateItem(id, body);
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
  const { isActive } = await c.req.json();

  try {
    const item = await service.toggleActive(id, isActive);
    return onOkRestResponse({
      ctx: c,
      data: item,
      message: `Shop item ${isActive ? "activated" : "deactivated"} successfully`,
    });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to toggle shop item",
    });
  }
});

export { shopAdminRoutes };
