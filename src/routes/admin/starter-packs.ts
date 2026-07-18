import { Hono } from "hono";
import {
  onOkRestResponse,
  onErrorRestResponse,
} from "@/responses/response-builder";
import { middlewareAuth } from "@/middlewares/middlewareAuth";
import { adminGuard } from "@/middlewares/adminGuard";
import { StarterPackAdminService } from "@/services/admin/starter-pack-admin.service";

const starterPackAdminRoutes = new Hono();
const service = new StarterPackAdminService();

// ===== دریافت لیست تمام پکیج‌ها =====
starterPackAdminRoutes.get("/", middlewareAuth, adminGuard, async (c) => {
  try {
    const packs = await service.getAllPacks();
    return onOkRestResponse({ ctx: c, data: packs });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch starter packs",
    });
  }
});

// ===== دریافت یک پکیج با ID =====
starterPackAdminRoutes.get("/:id", middlewareAuth, adminGuard, async (c) => {
  const id = c.req.param("id");

  // ✅ بررسی وجود id
  if (!id) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Pack ID is required" });
  }

  try {
    const pack = await service.getPack(id);
    if (!pack) {
      return onErrorRestResponse({ ctx: c, errorMessage: "Pack not found" });
    }
    return onOkRestResponse({ ctx: c, data: pack });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch pack",
    });
  }
});

// ===== اعمال پکیج به کاربر =====
starterPackAdminRoutes.post("/apply", middlewareAuth, adminGuard, async (c) => {
  const { userId, packId } = await c.req.json();

  if (!userId || !packId) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "userId and packId are required",
    });
  }

  try {
    const result = await service.applyPackToUser(userId, packId);
    return onOkRestResponse({
      ctx: c,
      data: result,
      message: `Starter pack applied to user ${userId} successfully`,
    });
  } catch (error: any) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: error.message || "Failed to apply pack",
    });
  }
});

export { starterPackAdminRoutes };
