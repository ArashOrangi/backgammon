// src/services/otp/otp.service.ts
import { randomInt } from "crypto";

// ذخیره‌سازی موقت در حافظه (برای محیط توسعه)
const otpStore = new Map<string, { code: string; expiresAt: number }>();

export class OtpService {
  private readonly OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 دقیقه

  /**
   * تولید و ذخیره کد OTP برای شماره موبایل
   */
  generateOtp(phone: string): string {
    const code = String(randomInt(100000, 999999)); // ۶ رقمی
    const expiresAt = Date.now() + this.OTP_EXPIRY_MS;
    otpStore.set(phone, { code, expiresAt });
    return code;
  }

  /**
   * اعتبارسنجی کد OTP
   */
  verifyOtp(phone: string, code: string): boolean {
    const record = otpStore.get(phone);
    if (!record) return false;
    if (Date.now() > record.expiresAt) {
      otpStore.delete(phone);
      return false;
    }
    const isValid = record.code === code;
    if (isValid) {
      otpStore.delete(phone); // کد یک‌بار مصرف
    }
    return isValid;
  }
}
