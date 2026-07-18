import { Hono } from "hono";
import {
  onOkRestResponse,
  onErrorRestResponse,
  onValidationsRestResponse,
} from "@/responses/response-builder";
import { middlewareAuth } from "@/middlewares/middlewareAuth";
import { adminGuard } from "@/middlewares/adminGuard";
import { UserInventoryAdminService } from "@/services/admin/user-inventory-admin.service";

const userInventoryAdminRoutes = new Hono();
const service = new UserInventoryAdminService();

// ===== دریافت موجودی کاربر =====
userInventoryAdminRoutes.get(
  "/:userId",
  middlewareAuth,
  adminGuard,
  async (c) => {
    const userId = Number(c.req.param("userId"));

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
    const userId = Number(c.req.param("userId"));
    const { inventoryItemId, amount } = await c.req.json();

    if (!inventoryItemId) {
      return onValidationsRestResponse({
        ctx: c,
        validations: { inventoryItemId: ["Required"] },
      });
    }

    try {
      const result = await service.addItemToUser(
        userId,
        inventoryItemId,
        amount || 1,
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
    const userId = Number(c.req.param("userId"));
    const { inventoryItemId, amount } = await c.req.json();

    if (!inventoryItemId) {
      return onValidationsRestResponse({
        ctx: c,
        validations: { inventoryItemId: ["Required"] },
      });
    }

    try {
      const result = await service.removeItemFromUser(
        userId,
        inventoryItemId,
        amount || 1,
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
    const userId = Number(c.req.param("userId"));
    const { amount } = await c.req.json();

    if (!amount || amount <= 0) {
      return onValidationsRestResponse({
        ctx: c,
        validations: { amount: ["Must be a positive number"] },
      });
    }

    try {
      const result = await service.addCoin(userId, amount);
      return onOkRestResponse({
        ctx: c,
        data: result,
        message: `Added ${amount} coin to user ${userId}`,
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
    const userId = Number(c.req.param("userId"));
    const { amount } = await c.req.json();

    if (!amount || amount <= 0) {
      return onValidationsRestResponse({
        ctx: c,
        validations: { amount: ["Must be a positive number"] },
      });
    }

    try {
      const result = await service.addDiamond(userId, amount);
      return onOkRestResponse({
        ctx: c,
        data: result,
        message: `Added ${amount} diamond to user ${userId}`,
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
