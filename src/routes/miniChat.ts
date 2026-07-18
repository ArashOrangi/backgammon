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
import { validator } from "@/components/validator";
import {
  CategoryCreateSchema,
  CategoryUpdateSchema,
  CategoryIdSchema,
  MessageCreateSchema,
  MessageUpdateSchema,
  MessageIdSchema,
  CategoryMessagesSchema,
} from "@/validations/chat.schema";

export const chatRoutes = new Hono();

// ===== Categories =====

// دریافت لیست همه دسته‌بندی‌ها (فقط فعال‌ها)
chatRoutes.get("/categories", async (ctx) => {
  try {
    const result = await getAllCategories(false);
    if (!result || result === OrmState.Error) {
      return onErrorRestResponse({
        ctx: ctx,
        errorMessage: "Failed to fetch categories",
      });
    }
    return onOkRestResponse({ ctx: ctx, data: result });
  } catch (error) {
    return onErrorRestResponse({
      ctx: ctx,
      errorMessage: "Failed to fetch categories",
    });
  }
});

// دریافت یک دسته‌بندی با پیام‌هایش
chatRoutes.get("/categories/:id", async (ctx) => {
  try {
    const idRaw = ctx.req.param("id");
    const validation = validator({
      data: { id: Number(idRaw) },
      schema: CategoryIdSchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: ctx,
        validations: validation.errors,
      });
    }

    const id = validation.data.id;
    const result = await getCategoryById(id);
    if (!result || result === OrmState.Error) {
      return onErrorRestResponse({
        ctx: ctx,
        errorMessage: "Category not found",
      });
    }
    return onOkRestResponse({ ctx: ctx, data: result });
  } catch (error) {
    return onErrorRestResponse({
      ctx: ctx,
      errorMessage: "Failed to fetch category",
    });
  }
});

// ایجاد دسته‌بندی (Admin)
chatRoutes.post("/categories", async (ctx) => {
  try {
    const body = await ctx.req.json();
    const validation = validator({ data: body, schema: CategoryCreateSchema });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: ctx,
        validations: validation.errors,
      });
    }

    const result = await createCategory(validation.data);
    if (!result || result === OrmState.Error) {
      return onErrorRestResponse({
        ctx: ctx,
        errorMessage: "Failed to create category",
      });
    }
    return onOkRestResponse({ ctx: ctx, data: result });
  } catch (error) {
    return onErrorRestResponse({
      ctx: ctx,
      errorMessage: "Failed to create category",
    });
  }
});

// بروزرسانی دسته‌بندی (Admin)
chatRoutes.put("/categories/:id", async (ctx) => {
  try {
    const idRaw = ctx.req.param("id");
    const idValidation = validator({
      data: { id: Number(idRaw) },
      schema: CategoryIdSchema,
    });
    if (!idValidation.isValid) {
      return onValidationsRestResponse({
        ctx: ctx,
        validations: idValidation.errors,
      });
    }

    const id = idValidation.data.id;
    const body = await ctx.req.json();
    const validation = validator({ data: body, schema: CategoryUpdateSchema });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: ctx,
        validations: validation.errors,
      });
    }

    const result = await updateCategory(id, validation.data);
    if (!result || result === OrmState.Error) {
      return onErrorRestResponse({
        ctx: ctx,
        errorMessage: "Failed to update category",
      });
    }
    return onOkRestResponse({ ctx: ctx, data: result });
  } catch (error) {
    return onErrorRestResponse({
      ctx: ctx,
      errorMessage: "Failed to update category",
    });
  }
});

// حذف دسته‌بندی (Admin)
chatRoutes.delete("/categories/:id", async (ctx) => {
  try {
    const idRaw = ctx.req.param("id");
    const validation = validator({
      data: { id: Number(idRaw) },
      schema: CategoryIdSchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: ctx,
        validations: validation.errors,
      });
    }

    const id = validation.data.id;
    const result = await deleteCategory(id);
    if (!result || result === OrmState.Error) {
      return onErrorRestResponse({
        ctx: ctx,
        errorMessage: "Failed to delete category",
      });
    }
    return onOkRestResponse({ ctx: ctx, data: { deleted: true } });
  } catch (error) {
    return onErrorRestResponse({
      ctx: ctx,
      errorMessage: "Failed to delete category",
    });
  }
});

// ===== Messages =====

// دریافت پیام‌های یک دسته‌بندی
chatRoutes.get("/categories/:categoryId/messages", async (ctx) => {
  try {
    const categoryIdRaw = ctx.req.param("categoryId");
    const validation = validator({
      data: { categoryId: Number(categoryIdRaw) },
      schema: CategoryMessagesSchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: ctx,
        validations: validation.errors,
      });
    }

    const categoryId = validation.data.categoryId;
    const result = await getMessagesByCategory(categoryId);
    if (!result || result === OrmState.Error) {
      return onErrorRestResponse({
        ctx: ctx,
        errorMessage: "Failed to fetch messages",
      });
    }
    return onOkRestResponse({ ctx: ctx, data: result });
  } catch (error) {
    return onErrorRestResponse({
      ctx: ctx,
      errorMessage: "Failed to fetch messages",
    });
  }
});

// ایجاد پیام جدید (Admin)
chatRoutes.post("/messages", async (ctx) => {
  try {
    const body = await ctx.req.json();
    const validation = validator({ data: body, schema: MessageCreateSchema });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: ctx,
        validations: validation.errors,
      });
    }

    const result = await createMessage(validation.data);
    if (!result || result === OrmState.Error) {
      return onErrorRestResponse({
        ctx: ctx,
        errorMessage: "Failed to create message",
      });
    }
    return onOkRestResponse({ ctx: ctx, data: result });
  } catch (error) {
    return onErrorRestResponse({
      ctx: ctx,
      errorMessage: "Failed to create message",
    });
  }
});

// بروزرسانی پیام (Admin)
chatRoutes.put("/messages/:id", async (ctx) => {
  try {
    const idRaw = ctx.req.param("id");
    const idValidation = validator({
      data: { id: Number(idRaw) },
      schema: MessageIdSchema,
    });
    if (!idValidation.isValid) {
      return onValidationsRestResponse({
        ctx: ctx,
        validations: idValidation.errors,
      });
    }

    const id = idValidation.data.id;
    const body = await ctx.req.json();
    const validation = validator({ data: body, schema: MessageUpdateSchema });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: ctx,
        validations: validation.errors,
      });
    }

    const result = await updateMessage(id, validation.data);
    if (!result || result === OrmState.Error) {
      return onErrorRestResponse({
        ctx: ctx,
        errorMessage: "Failed to update message",
      });
    }
    return onOkRestResponse({ ctx: ctx, data: result });
  } catch (error) {
    return onErrorRestResponse({
      ctx: ctx,
      errorMessage: "Failed to update message",
    });
  }
});

// حذف پیام (Admin)
chatRoutes.delete("/messages/:id", async (ctx) => {
  try {
    const idRaw = ctx.req.param("id");
    const validation = validator({
      data: { id: Number(idRaw) },
      schema: MessageIdSchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: ctx,
        validations: validation.errors,
      });
    }

    const id = validation.data.id;
    const result = await deleteMessage(id);
    if (!result || result === OrmState.Error) {
      return onErrorRestResponse({
        ctx: ctx,
        errorMessage: "Failed to delete message",
      });
    }
    return onOkRestResponse({ ctx: ctx, data: { deleted: true } });
  } catch (error) {
    return onErrorRestResponse({
      ctx: ctx,
      errorMessage: "Failed to delete message",
    });
  }
});
