// routes/users.ts
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
  RegisterSchema,
  UpdateProfileSchema,
} from "@/validations/userSchema";
import { IMiddlewareAuth } from "@/models/middleware";
import { middlewareAuth } from "@/middlewares/middlewareAuth";

export const userRoutes = new Hono<IMiddlewareAuth>();

// ایجاد کاربر ساده (Legacy)
userRoutes.post("/", async (c) => {
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
});

// دریافت اطلاعات کاربر + پروفایل (با middlewareAuth)
userRoutes.get("/profile/:userId", middlewareAuth, async (c) => {
  const currentUser = c.get("user"); // 👈 کاربر درخواست‌کننده را بگیر
  const userId = Number(c.req.param("userId"));

  if (isNaN(userId) || userId <= 0) {
    return onValidationsRestResponse({
      ctx: c,
      validations: { userId: ["Must be a positive integer"] },
    });
  }

  // 👈 currentUser?.id را به تابع پاس بده
  const result = await getUserWithProfile(userId, currentUser?.id);
  if (!result) {
    return onErrorRestResponse({ ctx: c, errorMessage: "User not found" });
  }
  return onOkRestResponse({ ctx: c, data: result });
});

// بروزرسانی پروفایل (با middlewareAuth)
userRoutes.put("/profile/:userId", middlewareAuth, async (c) => {
  const userIdRaw = c.req.param("userId");
  const userId = Number(userIdRaw);
  if (isNaN(userId) || !Number.isInteger(userId) || userId <= 0) {
    return onValidationsRestResponse({
      ctx: c,
      validations: { userId: ["Must be a positive integer"] },
      message: "Invalid userId",
    });
  }
  const body = await c.req.json();
  const validation = validator({ data: body, schema: UpdateProfileSchema });
  if (!validation.isValid) {
    return onValidationsRestResponse({
      ctx: c,
      validations: validation.errors,
      message: "Validation failed",
    });
  }
  const { provinceId, cityId, image, phoneNumber } = validation.data;
  const result = await updateUserProfile(userId, {
    // fullName,
    provinceId,
    cityId,
    // image,
    phoneNumber,
  });
  if (!result || (result as any).errorType) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Update failed" });
  }
  return onOkRestResponse({ ctx: c, data: result });
});

// دریافت کاربر فعلی (از توکن)
userRoutes.get("/me", middlewareAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Not authenticated" });
  }
  return onOkRestResponse({ ctx: c, data: user });
});
