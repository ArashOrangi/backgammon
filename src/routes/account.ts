// routes/account.ts
import { Hono } from "hono";
import {
  onOkRestResponse,
  onErrorRestResponse,
  onValidationsRestResponse,
} from "@/responses/response-builder";
import { IMiddlewareAuth } from "@/models/middleware";
import { messageError } from "@/static/messageError";
import { messagesValidation } from "@/static/messageValidation";
import { validator } from "@/components/validator";
import { RegisterSchema, LoginSchema } from "@/validations/userSchema";
import {
  prismaUserGetByUsername,
  createUserWithProfile,
  updateUserProfile,
} from "@/models/user";
import { jwtSignUser } from "@/components/jwtHandler";
import { keyUser } from "@/static/statics";
import myCrypt from "@/components/myCrypt";
import { OrmState } from "@/models/enums";

export const accountRoute = new Hono<IMiddlewareAuth>();

// ثبت‌نام کاربر جدید
accountRoute.post("/register", async (ctx) => {
  try {
    const body = await ctx.req.json();
    const validation = validator({ data: body, schema: RegisterSchema });
    if (!validation.isValid) {
      return onValidationsRestResponse({ ctx, validations: validation.errors });
    }

    const { userName, password, phoneNumber, gender } = validation.data;

    // بررسی تکراری نبودن userName
    const existing = await prismaUserGetByUsername(userName);
    if (existing && existing !== OrmState.Error) {
      return onErrorRestResponse({
        ctx,
        errorMessage: "userName already taken",
      });
    }

    const hashedPassword = await myCrypt.hashed({ password });
    const user = await createUserWithProfile({
      userName,
      // fullName,
      phoneNumber,
      gender,
    });

    if (!user || user === OrmState.Error) {
      return onErrorRestResponse({
        ctx,
        errorMessage: messageError.user.create,
      });
    }

    // به‌روزرسانی پسورد
    await updateUserProfile(user.id, { password: hashedPassword });

    // تولید توکن
    const token = await jwtSignUser({ userName });
    ctx.header(
      "Set-Cookie",
      `${keyUser}=${token}; Path=/; HttpOnly; Max-Age=${60 * 60 * 24 * 30}`,
    );

    return onOkRestResponse({
      ctx,
      data: { user, token },
      message: "Registration successful",
    });
  } catch (error) {
    return onErrorRestResponse({
      ctx,
      errorMessage: messageError.profile.register,
    });
  }
});

// ورود با نام کاربری و رمز عبور
accountRoute.post("/login", async (ctx) => {
  try {
    const body = await ctx.req.json();
    const validation = validator({ data: body, schema: LoginSchema });
    if (!validation.isValid) {
      return onValidationsRestResponse({ ctx, validations: validation.errors });
    }

    const { userName, password } = validation.data;
    const user = await prismaUserGetByUsername(userName);
    if (!user || user === OrmState.Error) {
      return onErrorRestResponse({ ctx, errorMessage: "Invalid credentials" });
    }

    if (!user.password) {
      return onErrorRestResponse({
        ctx,
        errorMessage: "Account has no password set",
      });
    }

    const isValid = await myCrypt.verify({ password, hash: user.password });
    if (!isValid) {
      return onValidationsRestResponse({
        ctx,
        validations: { password: messagesValidation.password.check },
      });
    }

    const token = await jwtSignUser({ userName });
    ctx.header(
      "Set-Cookie",
      `${keyUser}=${token}; Path=/; HttpOnly; Max-Age=${60 * 60 * 24 * 30}`,
    );

    return onOkRestResponse({
      ctx,
      data: { user, token },
      message: "Login successful",
    });
  } catch (error) {
    return onErrorRestResponse({ ctx, errorMessage: messageError.user.login });
  }
});

// خروج از حساب
accountRoute.post("/logout", async (ctx) => {
  try {
    ctx.header("Set-Cookie", `${keyUser}=; Path=/; HttpOnly; Max-Age=0`);
    return onOkRestResponse({ ctx, data: {}, message: "Logged out" });
  } catch (error) {
    return onErrorRestResponse({ ctx, errorMessage: messageError.user.logout });
  }
});
