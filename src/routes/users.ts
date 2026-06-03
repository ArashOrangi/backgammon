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

export const userRoutes = new Hono();

// ساخت کاربر ساده بدون پروفایل (Legacy)
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

// ثبت‌نام کامل با پروفایل
userRoutes.post("/register", async (c) => {
  const body = await c.req.json();
  const validation = validator({ data: body, schema: RegisterSchema });
  if (!validation.isValid) {
    return onValidationsRestResponse({
      ctx: c,
      validations: validation.errors,
      message: "Validation failed",
    });
  }
  const { userName, fullName, provinceId, cityId, image, mobile, gender } =
    validation.data;
  const result = await createUserWithProfile({
    userName,
    fullName,
    provinceId: provinceId ? Number(provinceId) : undefined,
    cityId: cityId ? Number(cityId) : undefined,
    image,
    mobile,
    gender,
  });
  if (!result || (result as any).errorType) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Registration failed" });
  }
  return onOkRestResponse({ ctx: c, data: result });
});

// دریافت اطلاعات کاربر + پروفایل
userRoutes.get("/profile/:userId", async (c) => {
  const userIdRaw = c.req.param("userId");
  const userId = Number(userIdRaw);
  if (isNaN(userId) || !Number.isInteger(userId) || userId <= 0) {
    return onValidationsRestResponse({
      ctx: c,
      validations: { userId: ["Must be a positive integer"] },
      message: "Invalid userId",
    });
  }
  const result = await getUserWithProfile(userId);
  if (!result || result === OrmState.Error) {
    return onErrorRestResponse({ ctx: c, errorMessage: "User not found" });
  }
  return onOkRestResponse({ ctx: c, data: result });
});

// بروزرسانی پروفایل
userRoutes.put("/profile/:userId", async (c) => {
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
  const { fullName, provinceId, cityId, image, mobile } = validation.data;
  const result = await updateUserProfile(userId, {
    fullName,
    provinceId,
    cityId,
    image,
    mobile,
  });
  if (!result || (result as any).errorType) {
    return onErrorRestResponse({ ctx: c, errorMessage: "Update failed" });
  }
  return onOkRestResponse({ ctx: c, data: result });
});
