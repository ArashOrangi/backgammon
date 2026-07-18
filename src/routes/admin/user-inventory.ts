import { Hono } from "hono";
import {
  onOkRestResponse,
  onErrorRestResponse,
  onValidationsRestResponse,
} from "@/responses/response-builder";
import { middlewareAuth } from "@/middlewares/middlewareAuth";
import { adminGuard } from "@/middlewares/adminGuard";
import { UserInventoryAdminService } from "@/services/admin/user-inventory-admin.service";
import { validator } from "@/components/validator";
import {
  UserInventoryAddSchema,
  UserInventoryRemoveSchema,
  AddCoinSchema,
  AddDiamondSchema,
} from "@/validations/admin.schema";

const userInventoryAdminRoutes = new Hono();
const service = new UserInventoryAdminService();

// Helper to validate userId parameter (accepts undefined)
function validateUserId(userIdParam: string | undefined): number | null {
  if (!userIdParam) return null;
  const userId = Number(userIdParam);
  if (isNaN(userId) || userId < 1) return null;
  return userId;
}

// ===== دریافت موجودی کاربر =====
userInventoryAdminRoutes.get(
  "/:userId",
  middlewareAuth,
  adminGuard,
  async (c) => {
    const userId = validateUserId(c.req.param("userId"));
    if (!userId) {
      return onValidationsRestResponse({
        ctx: c,
        validations: { userId: ["Must be a positive integer"] },
      });
    }

    try {
      const inventory = await service.getUserInventory(userId);
      return onOkRestResponse({ ctx: c, data: inventory });
    } catch (error) {
      return onErrorRestResponse({
        ctx: c,
        errorMessage: "Failed to fetch user inventory",
      });
    }
  },
);

// ===== اضافه کردن آیتم به کاربر =====
userInventoryAdminRoutes.post(
  "/:userId/add",
  middlewareAuth,
  adminGuard,
  async (c) => {
    const userId = validateUserId(c.req.param("userId"));
    if (!userId) {
      return onValidationsRestResponse({
        ctx: c,
        validations: { userId: ["Must be a positive integer"] },
      });
    }

    const body = await c.req.json();
    const validation = validator({
      data: body,
      schema: UserInventoryAddSchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: c,
        validations: validation.errors,
      });
    }

    try {
      const result = await service.addItemToUser(
        userId,
        validation.data.inventoryItemId,
        validation.data.amount || 1,
      );
      return onOkRestResponse({
        ctx: c,
        data: result,
        message: "Item added to user successfully",
      });
    } catch (error) {
      return onErrorRestResponse({
        ctx: c,
        errorMessage: "Failed to add item to user",
      });
    }
  },
);

// ===== کم کردن آیتم از کاربر =====
userInventoryAdminRoutes.post(
  "/:userId/remove",
  middlewareAuth,
  adminGuard,
  async (c) => {
    const userId = validateUserId(c.req.param("userId"));
    if (!userId) {
      return onValidationsRestResponse({
        ctx: c,
        validations: { userId: ["Must be a positive integer"] },
      });
    }

    const body = await c.req.json();
    const validation = validator({
      data: body,
      schema: UserInventoryRemoveSchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: c,
        validations: validation.errors,
      });
    }

    try {
      const result = await service.removeItemFromUser(
        userId,
        validation.data.inventoryItemId,
        validation.data.amount || 1,
      );
      return onOkRestResponse({
        ctx: c,
        data: result,
        message: "Item removed from user successfully",
      });
    } catch (error: any) {
      return onErrorRestResponse({
        ctx: c,
        errorMessage: error.message || "Failed to remove item",
      });
    }
  },
);

// ===== افزودن سکه به کاربر =====
userInventoryAdminRoutes.post(
  "/:userId/add-coin",
  middlewareAuth,
  adminGuard,
  async (c) => {
    const userId = validateUserId(c.req.param("userId"));
    if (!userId) {
      return onValidationsRestResponse({
        ctx: c,
        validations: { userId: ["Must be a positive integer"] },
      });
    }

    const body = await c.req.json();
    const validation = validator({ data: body, schema: AddCoinSchema });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: c,
        validations: validation.errors,
      });
    }

    try {
      const result = await service.addCoin(userId, validation.data.amount);
      return onOkRestResponse({
        ctx: c,
        data: result,
        message: `Added ${validation.data.amount} coin to user ${userId}`,
      });
    } catch (error) {
      return onErrorRestResponse({
        ctx: c,
        errorMessage: "Failed to add coin",
      });
    }
  },
);

// ===== افزودن الماس به کاربر =====
userInventoryAdminRoutes.post(
  "/:userId/add-diamond",
  middlewareAuth,
  adminGuard,
  async (c) => {
    const userId = validateUserId(c.req.param("userId"));
    if (!userId) {
      return onValidationsRestResponse({
        ctx: c,
        validations: { userId: ["Must be a positive integer"] },
      });
    }

    const body = await c.req.json();
    const validation = validator({ data: body, schema: AddDiamondSchema });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: c,
        validations: validation.errors,
      });
    }

    try {
      const result = await service.addDiamond(userId, validation.data.amount);
      return onOkRestResponse({
        ctx: c,
        data: result,
        message: `Added ${validation.data.amount} diamond to user ${userId}`,
      });
    } catch (error) {
      return onErrorRestResponse({
        ctx: c,
        errorMessage: "Failed to add diamond",
      });
    }
  },
);

export { userInventoryAdminRoutes };
