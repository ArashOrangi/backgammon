import { prisma } from "../src/components/prisma";

async function main() {
  const existing = await prisma.timerPreset.findFirst();
  if (!existing) {
    await prisma.timerPreset.create({
      data: {
        name: "default",
        primarySeconds: 12,
        secondarySeconds: 120,
        isDefault: true,
        gameType: "casual",
      },
    });
    console.log("✅ Default timer preset created (12s / 120s)");
  } else {
    console.log("Timer preset already exists, skipping seed.");
  }
}
main().finally(() => prisma.$disconnect());
