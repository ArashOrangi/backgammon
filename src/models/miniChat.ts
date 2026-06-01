// src/models/chat.ts
import { prisma } from "@/components/prisma";
import { errorHandlersOnPrisma } from "@/components/errorHandler";
import { OrmState } from "./enums";

// ---------- Categories ----------
export async function getAllCategories(includeInactive = false) {
  try {
    return await prisma.messagesCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { id: "asc" },
      include: {
        messages: {
          where: { isActive: true },
          orderBy: { order: "asc" },
        },
      },
    });
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function getCategoryById(id: number) {
  try {
    return await prisma.messagesCategory.findUnique({
      where: { id },
      include: {
        messages: {
          where: { isActive: true },
          orderBy: { order: "asc" },
        },
      },
    });
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function createCategory(data: {
  nameFa: string;
  nameEn?: string;
  isFree?: boolean;
  conditions?: any;
  lock?: boolean;
  appAction?: boolean;
}) {
  try {
    return await prisma.messagesCategory.create({
      data: {
        nameFa: data.nameFa,
        nameEn: data.nameEn,
        isFree: data.isFree ?? false,
        conditions: data.conditions,
        lock: data.lock ?? false,
        appAction: data.appAction ?? true,
      },
    });
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function updateCategory(
  id: number,
  data: Partial<{
    nameFa: string;
    nameEn: string;
    isFree: boolean;
    conditions: any;
    lock: boolean;
    appAction: boolean;
  }>,
) {
  try {
    return await prisma.messagesCategory.update({
      where: { id },
      data,
    });
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function deleteCategory(id: number) {
  try {
    // همچنین پیام‌های مربوطه حذف می‌شوند (اگر cascade در پراسما تنظیم شده باشد)
    return await prisma.messagesCategory.delete({ where: { id } });
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

// ---------- Messages ----------
export async function getMessagesByCategory(categoryId: number) {
  try {
    return await prisma.staticMessages.findMany({
      where: { categoryId, isActive: true },
      orderBy: { order: "asc" },
    });
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function createMessage(data: {
  message: string;
  categoryId: number;
  order?: number;
  isActive?: boolean;
}) {
  try {
    return await prisma.staticMessages.create({
      data: {
        message: data.message,
        categoryId: data.categoryId,
        order: data.order,
        isActive: data.isActive ?? true,
      },
    });
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function updateMessage(
  id: number,
  data: Partial<{
    message: string;
    order: number;
    isActive: boolean;
  }>,
) {
  try {
    return await prisma.staticMessages.update({
      where: { id },
      data,
    });
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}

export async function deleteMessage(id: number) {
  try {
    return await prisma.staticMessages.delete({ where: { id } });
  } catch (error) {
    return errorHandlersOnPrisma({ error });
  }
}
