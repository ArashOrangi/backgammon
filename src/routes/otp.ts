// src/routes/otp.ts
import { Hono } from "hono";
import { IMiddlewareAuth } from "@/models/middleware";
import {
  onOkRestResponse,
  onErrorRestResponse,
  onValidationsRestResponse,
} from "@/responses/response-builder";
import { validator } from "@/components/validator";
import { Type, Static } from "@sinclair/typebox";
import { prismaUserGetOrCreate } from "@/models/user";
import { jwtSignUser } from "@/components/jwtHandler";
import { OrmState } from "@/models/enums";
import { OtpService } from "@/services/otp.service";

const otpRoutes = new Hono();
const otpService = new OtpService();

// ===== Schema اعتبارسنجی =====
const SendOtpSchema = Type.Object({
  phone: Type.String({ pattern: "^[0-9]{11}$" }),
});

const VerifyOtpSchema = Type.Object({
  phone: Type.String({ pattern: "^[0-9]{11}$" }),
  code: Type.String({ pattern: "^[0-9]{6}$" }),
});

// ===== ۱. ارسال کد OTP =====
otpRoutes.post("/send", async (c) => {
  const body = await c.req.json();
  const validation = validator({ data: body, schema: SendOtpSchema });
  if (!validation.isValid) {
    return onValidationsRestResponse({
      ctx: c,
      validations: validation.errors,
    });
  }

  const { phone } = validation.data;
  const code = otpService.generateOtp(phone);

  // در آینده، اینجا کد را به سرویس پیامک ارسال می‌کنیم
  console.log(`[OTP] 📱 Code for ${phone}: ${code}`);

  return onOkRestResponse({
    ctx: c,
    data: {
      message: "کد تأیید با موفقیت ارسال شد",
      code, // در محیط توسعه بازگردانده می‌شود
    },
  });
});

// ===== ۲. تأیید کد OTP =====
otpRoutes.post("/verify", async (c) => {
  const body = await c.req.json();
  const validation = validator({ data: body, schema: VerifyOtpSchema });
  if (!validation.isValid) {
    return onValidationsRestResponse({
      ctx: c,
      validations: validation.errors,
    });
  }

  const { phone, code } = validation.data;

  if (!otpService.verifyOtp(phone, code)) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "کد تأیید نامعتبر یا منقضی شده است",
    });
  }

  // ایجاد یا پیدا کردن کاربر با شماره موبایل
  // از userName به‌عنوان شماره موبایل استفاده می‌کنیم (با پیشوند "user_")
  const userName = `user_${phone}`;
  const user = await prismaUserGetOrCreate(userName);
  if (user === OrmState.Error) {
    return onErrorRestResponse({
      ctx: c,
      errorMessage: "خطا در ایجاد کاربر",
    });
  }

  // تولید توکن JWT
  const token = await jwtSignUser({ userName });

  // در صورت تمایل، شماره موبایل را در پروفایل کاربر ذخیره کنید
  // (فعلاً نیازی نیست)

  return onOkRestResponse({
    ctx: c,
    data: {
      user,
      token,
      message: "احراز هویت با موفقیت انجام شد",
    },
  });
});

export { otpRoutes };
