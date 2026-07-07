import { prisma } from "../src/components/prisma";

async function main() {
  const existing = await prisma.timerPreset.findFirst();
  if (!existing) {
    await prisma.timerPreset.create({
      data: {
        name: "default",
        primarySeconds: 30,
        secondarySeconds: 40,
        isDefault: true,
        gameType: "casual",
      },
    });
    console.log("✅ Default timer preset created (30s / 40s)");
  } else {
    console.log("Timer preset already exists, skipping seed.");
  }
}
main().finally(() => prisma.$disconnect());
