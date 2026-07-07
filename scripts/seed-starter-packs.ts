import { prisma } from "../src/components/prisma";
import { getStarterPacks } from "../src/services/starter-pack.service";

// قیمت‌گذاری بر اساس نوع بسته
const PRICE_CONFIG: Record<
  string,
  {
    coinPrice: number;
    diamondPrice: number;
    discountCoinPrice?: number;
    discountDiamondPrice?: number;
  }
> = {
  starter_classic: { coinPrice: 1000, diamondPrice: 10 },
  starter_premium: {
    coinPrice: 2500,
    diamondPrice: 25,
    discountCoinPrice: 2000,
    discountDiamondPrice: 20,
  },
  starter_legendary: {
    coinPrice: 5000,
    diamondPrice: 50,
    discountCoinPrice: 3500,
    discountDiamondPrice: 35,
  },
};

async function main() {
  console.log("🌱 Seeding Starter Packs to Shop...");

  const packs = getStarterPacks();

  for (const pack of packs) {
    // بررسی اینکه آیا این بسته قبلاً در فروشگاه وجود دارد
    const existing = await prisma.shopItem.findFirst({
      where: { name: pack.name },
    });

    if (existing) {
      console.log(
        `⏩ Starter pack "${pack.name}" already exists in shop, skipping.`,
      );
      continue;
    }

    // تبدیل آیتم‌های بسته به آرایه‌ای از { inventoryItemId, amount }
    const packageItems: Array<{ inventoryItemId: number; amount: number }> = [];

    for (const item of pack.items) {
      const inventoryItem = await prisma.inventoryItem.findFirst({
        where: { visualCode: item.visualCode },
      });

      if (!inventoryItem) {
        console.warn(
          `⚠️ InventoryItem with visualCode "${item.visualCode}" not found. Skipping.`,
        );
        continue;
      }

      packageItems.push({
        inventoryItemId: inventoryItem.id,
        amount: item.amount,
      });
    }

    // اگر هیچ آیتمی برای بسته پیدا نشد، ادامه نده
    if (packageItems.length === 0) {
      console.warn(
        `⚠️ No inventory items found for pack "${pack.name}". Skipping.`,
      );
      continue;
    }

    const config = PRICE_CONFIG[pack.id];
    if (!config) {
      console.warn(`⚠️ No price config for pack "${pack.id}". Skipping.`);
      continue;
    }

    const { coinPrice, diamondPrice, discountCoinPrice, discountDiamondPrice } =
      config;

    // بررسی اینکه آیا تخفیف فعال است
    const hasDiscount =
      discountCoinPrice !== undefined || discountDiamondPrice !== undefined;

    // ایجاد آیتم فروشگاه
    await prisma.shopItem.create({
      data: {
        name: pack.name,
        description: pack.description,
        type: "PACKAGE",
        packageItems: packageItems,
        packageCoin: pack.coin,
        packageDiamond: pack.diamond,
        isActive: true,
        sortOrder: packs.indexOf(pack) + 1,
        coinPrice: coinPrice,
        diamondPrice: diamondPrice,
        realPrice: null,
        realCurrency: null,
        discountCoinPrice: discountCoinPrice || null,
        discountDiamondPrice: discountDiamondPrice || null,
        discountRealPrice: null,
        discountStartDate: hasDiscount ? new Date() : null,
        discountEndDate: hasDiscount
          ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          : null,
        displayImage: `/images/packs/${pack.id}.png`,
      },
    });

    console.log(`✅ Starter pack "${pack.name}" created in shop.`);
  }

  console.log("🌱 Seeding Starter Packs completed.");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding starter packs:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
