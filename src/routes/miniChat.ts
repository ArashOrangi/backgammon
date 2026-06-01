import { Hono } from "hono";
import {
  onOkRestResponse,
  onErrorRestResponse,
  onValidationsRestResponse,
} from "@/responses/response-builder";
import {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getMessagesByCategory,
  createMessage,
  updateMessage,
  deleteMessage,
} from "@/models/miniChat";
import { OrmState } from "@/models/enums";

export const chatRoutes = new Hono();

// ---------- Categories ----------
// لیست همه دسته‌بندی‌ها (فقط فعال‌ها)
chatRoutes.get("/categories", async (ctx) => {
  const result = await getAllCategories(false);
  if (!result || result === OrmState.Error) {
    return onErrorRestResponse({
      ctx: ctx,
      errorMessage: "Failed to fetch categories",
    });
  }
  return onOkRestResponse({ ctx: ctx, data: result });
});

// دریافت یک دسته‌بندی با پیام‌هایش
chatRoutes.get("/categories/:id", async (ctx) => {
  const id = Number(ctx.req.param("id"));
  if (isNaN(id)) {
    return onValidationsRestResponse({
      ctx: ctx,
      validations: { id: ["Must be a number"] },
    });
  }
  const result = await getCategoryById(id);
  if (!result || result === OrmState.Error) {
    return onErrorRestResponse({
      ctx: ctx,
      errorMessage: "Category not found",
    });
  }
  return onOkRestResponse({ ctx: ctx, data: result });
});

// ایجاد دسته‌بندی (Admin)
chatRoutes.post("/categories", async (ctx) => {
  const body = await ctx.req.json();
  const { nameFa, nameEn, isFree, conditions, lock, isActive } = body;
  if (!nameFa) {
    return onValidationsRestResponse({
      ctx: ctx,
      validations: { nameFa: ["Required"] },
    });
  }
  const result = await createCategory({
    nameFa,
    nameEn,
    isFree,
    conditions,
    lock,
    isActive,
  });
  if (!result || result === OrmState.Error) {
    return onErrorRestResponse({
      ctx: ctx,
      errorMessage: "Failed to create category",
    });
  }
  return onOkRestResponse({ ctx: ctx, data: result });
});

// بروزرسانی دسته‌بندی (Admin)
chatRoutes.put("/categories/:id", async (ctx) => {
  const id = Number(ctx.req.param("id"));
  const body = await ctx.req.json();
  const { nameFa, nameEn, isFree, conditions, lock, isActive } = body;
  const result = await updateCategory(id, {
    nameFa,
    nameEn,
    isFree,
    conditions,
    lock,
    isActive,
  });
  if (!result || result === OrmState.Error) {
    return onErrorRestResponse({
      ctx: ctx,
      errorMessage: "Failed to update category",
    });
  }
  return onOkRestResponse({ ctx: ctx, data: result });
});

// حذف دسته‌بندی (Admin)
chatRoutes.delete("/categories/:id", async (ctx) => {
  const id = Number(ctx.req.param("id"));
  const result = await deleteCategory(id);
  if (!result || result === OrmState.Error) {
    return onErrorRestResponse({
      ctx: ctx,
      errorMessage: "Failed to delete category",
    });
  }
  return onOkRestResponse({ ctx: ctx, data: { deleted: true } });
});

// ---------- Messages ----------
// دریافت پیام‌های یک دسته‌بندی
chatRoutes.get("/categories/:categoryId/messages", async (ctx) => {
  const categoryId = Number(ctx.req.param("categoryId"));
  if (isNaN(categoryId)) {
    return onValidationsRestResponse({
      ctx: ctx,
      validations: { categoryId: ["Must be a number"] },
    });
  }
  const result = await getMessagesByCategory(categoryId);
  if (!result || result === OrmState.Error) {
    return onErrorRestResponse({
      ctx: ctx,
      errorMessage: "Failed to fetch messages",
    });
  }
  return onOkRestResponse({ ctx: ctx, data: result });
});

// ایجاد پیام جدید (Admin)
chatRoutes.post("/messages", async (ctx) => {
  const body = await ctx.req.json();
  const { message, categoryId, order, isActive } = body;
  if (!message || !categoryId) {
    return onValidationsRestResponse({
      ctx: ctx,
      validations: { message: ["Required"], categoryId: ["Required"] },
    });
  }
  const result = await createMessage({ message, categoryId, order, isActive });
  if (!result || result === OrmState.Error) {
    return onErrorRestResponse({
      ctx: ctx,
      errorMessage: "Failed to create message",
    });
  }
  return onOkRestResponse({ ctx: ctx, data: result });
});

// بروزرسانی پیام (Admin)
chatRoutes.put("/messages/:id", async (ctx) => {
  const id = Number(ctx.req.param("id"));
  const body = await ctx.req.json();
  const { message, order, isActive } = body;
  const result = await updateMessage(id, { message, order, isActive });
  if (!result || result === OrmState.Error) {
    return onErrorRestResponse({
      ctx: ctx,
      errorMessage: "Failed to update message",
    });
  }
  return onOkRestResponse({ ctx: ctx, data: result });
});

// حذف پیام (Admin)
chatRoutes.delete("/messages/:id", async (ctx) => {
  const id = Number(ctx.req.param("id"));
  const result = await deleteMessage(id);
  if (!result || result === OrmState.Error) {
    return onErrorRestResponse({
      ctx: ctx,
      errorMessage: "Failed to delete message",
    });
  }
  return onOkRestResponse({ ctx: ctx, data: { deleted: true } });
});
