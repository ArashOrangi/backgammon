// استفاده از Prisma Client مشترک پروژه (با مسیر نسبی)
import { prisma } from "../src/components/prisma.js";

async function main() {
  console.log("🌱 Seeding chat categories and messages...");

  const categoriesData = [
    {
      nameFa: "گفتگوهای روزمره",
      nameEn: "Daily Conversations",
      isFree: true,
      lock: false,
      isActive: true,
      messages: [
        { message: "سلام! چطوری؟", order: 1 },
        { message: "خوبی؟", order: 2 },
        { message: "خدا نگهدار", order: 3 },
        { message: "به امید دیدار", order: 4 },
        { message: "ممنون", order: 5 },
      ],
    },
    {
      nameFa: "کری خوانی (Trash Talk)",
      nameEn: "Trash Talk",
      isFree: true,
      lock: false,
      isActive: true,
      messages: [
        { message: "حالتو می‌گیرم!", order: 1 },
        { message: "فقط باختت مونده", order: 2 },
        { message: "بیا پای تخته", order: 3 },
        { message: "چی شد؟ جا خوردی؟", order: 4 },
        { message: "نوبت منه، نوبته منه", order: 5 },
      ],
    },
    {
      nameFa: "تشویق و انرژی مثبت",
      nameEn: "Encouragement",
      isFree: true,
      lock: false,
      isActive: true,
      messages: [
        { message: "آفرین! عالی بود", order: 1 },
        { message: "بهت افتخار می‌کنم", order: 2 },
        { message: "بیا بریم بعدی رو ببریم", order: 3 },
        { message: "نگران نباش، دفعه بعد می‌بری", order: 4 },
        { message: "همیشه قهرمانی", order: 5 },
      ],
    },
    {
      nameFa: "احساسات و عواطف",
      nameEn: "Emotions",
      isFree: false,
      lock: true,
      isActive: true,
      messages: [
        { message: "دلم برات تنگ شده", order: 1 },
        { message: "خوشحالم با تو بازی می‌کنم", order: 2 },
        { message: "ای کاش همیشه باهم بازی کنیم", order: 3 },
        { message: "متأسفم که باختی", order: 4 },
        { message: "چه حس خوبی", order: 5 },
      ],
    },
    {
      nameFa: "حرکات تاکتیکی",
      nameEn: "Tactical Moves",
      isFree: true,
      lock: false,
      isActive: true,
      messages: [
        { message: "تاس رو درست بیار", order: 1 },
        { message: "این حرکت رو می‌بینم", order: 2 },
        { message: "چه بلایی سر تخته آوردی", order: 3 },
        { message: "از این جا به بعد مال منه", order: 4 },
        { message: "شاه‌حرکت!", order: 5 },
      ],
    },
    {
      nameFa: "پایان بازی",
      nameEn: "Game End",
      isFree: true,
      lock: false,
      isActive: true,
      messages: [
        { message: "بازی خوبی بود", order: 1 },
        { message: "تبریک می‌گم", order: 2 },
        { message: "یاد گرفتم ازت", order: 3 },
        { message: "انتقام می‌گیرم بعداً", order: 4 },
        { message: "بازم بازی می‌کنیم؟", order: 5 },
      ],
    },
  ];

  for (const cat of categoriesData) {
    // پیدا کردن دسته‌بندی موجود با همین nameFa
    let category = await prisma.messagesCategory.findFirst({
      where: { nameFa: cat.nameFa },
    });

    if (!category) {
      category = await prisma.messagesCategory.create({
        data: {
          nameFa: cat.nameFa,
          nameEn: cat.nameEn,
          isFree: cat.isFree,
          lock: cat.lock,
          isActive: cat.isActive,
        },
      });
      console.log(
        `✅ Created category: ${category.nameFa} (id: ${category.id})`,
      );
    } else {
      category = await prisma.messagesCategory.update({
        where: { id: category.id },
        data: {
          nameEn: cat.nameEn,
          isFree: cat.isFree,
          lock: cat.lock,
          isActive: cat.isActive,
        },
      });
      console.log(
        `🔄 Updated category: ${category.nameFa} (id: ${category.id})`,
      );
    }

    // حذف تمام پیام‌های قبلی این دسته و ایجاد مجدد
    await prisma.staticMessages.deleteMany({
      where: { categoryId: category.id },
    });
    await prisma.staticMessages.createMany({
      data: cat.messages.map((msg) => ({
        message: msg.message,
        order: msg.order,
        categoryId: category.id,
        isActive: true,
      })),
    });
    console.log(
      `📝 Seeded ${cat.messages.length} messages for category "${category.nameFa}"`,
    );
  }

  console.log("🎉 Seeding finished!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
