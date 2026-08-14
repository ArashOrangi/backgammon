import { prisma } from "@/components/prisma";

const REGEN_INTERVAL_HOURS = 24;
const MAX_TICKET_BALANCE = 5;

export async function getTicketInfo(userId: number) {
  let ticket = await prisma.userTicket.findUnique({
    where: { userId },
  });

  if (!ticket) {
    ticket = await prisma.userTicket.create({
      data: {
        userId,
        balance: 0,
        lastRegenAt: new Date(),
      },
    });
  }

  const now = new Date();
  const nextRegenAt = new Date(
    ticket.lastRegenAt.getTime() + REGEN_INTERVAL_HOURS * 60 * 60 * 1000,
  );
  const remainingMs = Math.max(0, nextRegenAt.getTime() - now.getTime());

  return {
    balance: ticket.balance,
    nextRegenAt: nextRegenAt.toISOString(),
    remainingSeconds: Math.floor(remainingMs / 1000),
    regenIntervalHours: REGEN_INTERVAL_HOURS,
    maxBalance: MAX_TICKET_BALANCE,
  };
}
