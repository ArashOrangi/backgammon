// src/cron/ticket-regen.ts
import cron from "node-cron";
import { prisma } from "@/components/prisma";

// هر روز نیمه‌شب اجرا شود
cron.schedule("0 0 * * *", async () => {
  console.log("[Cron] Recharging tickets...");
  try {
    // به کاربرانی که موجودی کمتر از ۵ دارند، یک بلیط اضافه کن و lastRegenAt را به‌روز کن
    const users = await prisma.userTicket.findMany({
      where: { balance: { lt: 5 } },
    });

    for (const user of users) {
      await prisma.userTicket.update({
        where: { id: user.id },
        data: {
          balance: user.balance + 1,
          lastRegenAt: new Date(),
        },
      });
    }

    console.log(`[Cron] Recharged ${users.length} tickets.`);
  } catch (error) {
    console.error("[Cron] Ticket recharge failed:", error);
  }
});
