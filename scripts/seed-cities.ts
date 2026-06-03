import { prisma } from "../src/components/prisma";
import * as fs from "fs/promises";
import * as path from "path";

async function main() {
  console.log("🌱 Seeding provinces and cities...");

  // فرض می‌کنیم فایل‌های json در همین پوشه‌ی اسکریپت (scripts) قرار دارند
  const provincesPath = path.join(process.cwd(), "scripts", "province.json");
  const citiesPath = path.join(process.cwd(), "scripts", "city.json");

  const provincesData = JSON.parse(await fs.readFile(provincesPath, "utf-8"));
  const citiesData = JSON.parse(await fs.readFile(citiesPath, "utf-8"));

  // 1. پردازش استان‌ها
  console.log(`📌 Processing ${provincesData.length} provinces...`);
  for (const prov of provincesData) {
    let province = await prisma.provinces.findFirst({
      where: { faName: prov.faName },
    });

    if (!province) {
      province = await prisma.provinces.create({
        data: {
          id: prov.id,
          isActive: prov.appAction,
          createdAt: new Date(prov.createdAt),
          updatedAt: new Date(prov.updatedAt),
          faName: prov.faName,
          isCapital: prov.isCapital,
          enName: prov.enName,
          about: prov.about,
        },
      });
      console.log(
        `✅ Created province: ${province.faName} (id: ${province.id})`,
      );
    } else {
      province = await prisma.provinces.update({
        where: { id: province.id },
        data: {
          isActive: prov.appAction,
          updatedAt: new Date(prov.updatedAt),
          faName: prov.faName,
          isCapital: prov.isCapital,
          enName: prov.enName,
          about: prov.about,
        },
      });
      console.log(
        `🔄 Updated province: ${province.faName} (id: ${province.id})`,
      );
    }
  }

  // 2. پردازش شهرها
  console.log(`📌 Processing ${citiesData.length} cities...`);
  for (const city of citiesData) {
    const existingCity = await prisma.cities.findUnique({
      where: { id: city.id },
    });

    if (!existingCity) {
      await prisma.cities.create({
        data: {
          id: city.id,
          isActive: city.appAction,
          createdAt: new Date(city.createdAt),
          updatedAt: new Date(city.updatedAt),
          faName: city.faName,
          isCapital: city.isCapital,
          enName: city.enName,
          about: city.about,
          latitude: city.latitude,
          longitude: city.longitude,
          population: city.population,
          provinceId: city.provinceId,
        },
      });
      console.log(`✅ Created city: ${city.faName} (id: ${city.id})`);
    } else {
      await prisma.cities.update({
        where: { id: city.id },
        data: {
          isActive: city.appAction,
          updatedAt: new Date(city.updatedAt),
          faName: city.faName,
          isCapital: city.isCapital,
          enName: city.enName,
          about: city.about,
          latitude: city.latitude,
          longitude: city.longitude,
          population: city.population,
          provinceId: city.provinceId,
        },
      });
      console.log(`🔄 Updated city: ${city.faName} (id: ${city.id})`);
    }
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
