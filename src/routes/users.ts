import { Hono } from "hono";
import {
  onOkRestResponse,
  onErrorRestResponse,
  onValidationsRestResponse,
} from "@/responses/response-builder";
import { OrmState } from "@/models/enums";
import {
  prismaUserGetOrCreate,
  createUserWithProfile,
  getUserWithProfile,
  updateUserProfile,
} from "@/models/user";
import { validator } from "@/components/validator";
import {
  SimpleUserSchema,
  UpdateProfileSchema,
  UserIdSchema,
} from "@/validations/userSchema";
import { IMiddlewareAuth } from "@/models/middleware";
import { middlewareAuth } from "@/middlewares/middlewareAuth";

export const userRoutes = new Hono<IMiddlewareAuth>();

// ===== ایجاد کاربر ساده (Legacy) =====
userRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const validation = validator({ data: body, schema: SimpleUserSchema });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: c,
        validations: validation.errors,
        message: "Validation failed",
      });
    }
    const { userName } = validation.data;
    const result = await prismaUserGetOrCreate(userName);
    if (!result || result === OrmState.Error) {
      return onErrorRestResponse({
        ctx: c,
        errorMessage: "Failed to create user",
      });
    }
    return onOkRestResponse({ ctx: c, data: result });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to create user",
    });
  }
});

// ===== دریافت اطلاعات کاربر + پروفایل (با middlewareAuth) =====
userRoutes.get("/profile/:userId", middlewareAuth, async (c) => {
  try {
    const currentUser = c.get("user");
    const userIdRaw = c.req.param("userId");

    const validation = validator({
      data: { userId: Number(userIdRaw) },
      schema: UserIdSchema,
    });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: c,
        validations: validation.errors,
      });
    }

    const userId = validation.data.userId;
    const result = await getUserWithProfile(userId, currentUser?.id);
    if (!result) {
      return onErrorRestResponse({ ctx: c, errorMessage: "User not found" });
    }
    return onOkRestResponse({ ctx: c, data: result });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch user profile",
    });
  }
});

// ===== بروزرسانی پروفایل (با middlewareAuth) =====
userRoutes.put("/profile/:userId", middlewareAuth, async (c) => {
  try {
    const userIdRaw = c.req.param("userId");
    const userIdValidation = validator({
      data: { userId: Number(userIdRaw) },
      schema: UserIdSchema,
    });
    if (!userIdValidation.isValid) {
      return onValidationsRestResponse({
        ctx: c,
        validations: userIdValidation.errors,
        message: "Invalid userId",
      });
    }
    const userId = userIdValidation.data.userId;

    const body = await c.req.json();
    const validation = validator({ data: body, schema: UpdateProfileSchema });
    if (!validation.isValid) {
      return onValidationsRestResponse({
        ctx: c,
        validations: validation.errors,
        message: "Validation failed",
      });
    }

    // Map `image` from schema to `avatar` expected by `updateUserProfile`
    const { provinceId, cityId, image, phoneNumber } = validation.data;
    const result = await updateUserProfile(userId, {
      provinceId,
      cityId,
      phoneNumber,
      avatar: image, // image field from client maps to avatar
    });
    if (!result || (result as any).errorType) {
      return onErrorRestResponse({ ctx: c, errorMessage: "Update failed" });
    }
    return onOkRestResponse({ ctx: c, data: result });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to update profile",
    });
  }
});

// ===== دریافت کاربر فعلی (از توکن) =====
userRoutes.get("/me", middlewareAuth, async (c) => {
  try {
    const user = c.get("user");
    if (!user) {
      return onErrorRestResponse({
        ctx: c,
        errorMessage: "Not authenticated",
      });
    }
    return onOkRestResponse({ ctx: c, data: user });
  } catch (error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "Failed to fetch current user",
    });
  }
});
