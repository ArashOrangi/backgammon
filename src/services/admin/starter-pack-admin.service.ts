import { prisma } from "@/components/prisma";
import { applyStarterPackToUser } from "../starter-pack.service";

// ساختار پکیج‌ها (همانند فایل starter-pack.service.ts)
export interface StarterPackItem {
  visualCode: string;
  amount: number;
}

export interface StarterPackInput {
  id: string;
  name: string;
  description: string;
  items: StarterPackItem[];
  coin: number;
  diamond: number;
}

// این سرویس از داده‌های استاتیک استفاده می‌کند
// برای مدیریت پویا، باید پکیج‌ها را در دیتابیس ذخیره کنید
// در اینجا از همان STARTER_PACKS موجود استفاده می‌کنیم و عملیات CRUD را روی آن انجام می‌دهیم

import { getStarterPacks } from "../starter-pack.service";

export class StarterPackAdminService {
  // ===== دریافت لیست تمام پکیج‌ها =====
  async getAllPacks() {
    return getStarterPacks();
  }

  // ===== دریافت یک پکیج با ID =====
  async getPack(id: string) {
    const packs = getStarterPacks();
    return packs.find((p) => p.id === id) || null;
  }

  // ===== ایجاد پکیج جدید (در حافظه) =====
  // توجه: این فقط در حافظه انجام می‌شود. برای ذخیره دائمی باید از دیتابیس استفاده کنید.
  async createPack(data: StarterPackInput) {
    const packs = getStarterPacks();
    const existing = packs.find((p) => p.id === data.id);
    if (existing) {
      throw new Error(`Pack with id ${data.id} already exists`);
    }
    // در اینجا باید به دیتابیس اضافه کنید
    // فعلاً فقط در آرایه استاتیک ذخیره می‌شود (که پس از ری‌استارت سرور از بین می‌رود)
    // برای تولید، بهتر است یک مدل StarterPack در دیتابیس داشته باشید
    throw new Error(
      "Starter packs are static. To make it dynamic, create a StarterPack model in Prisma.",
    );
  }

  // ===== اعمال پکیج به کاربر =====
  async applyPackToUser(userId: number, packId: string) {
    return applyStarterPackToUser(userId, packId);
  }
}
