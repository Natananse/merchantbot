// Seed script — creates demo categories, demo sellers and demo products so
// the marketplace has data to browse immediately after setup.
//
// ⚠️ DEMO DATA — everything here is clearly marked as demo/test data.
// Run with: npm run db:seed   (safe to run multiple times)

const { prisma, disconnect } = require("./prisma");
const { log } = require("../utils/logger");

const CATEGORIES = [
  ["Electronics", "📱"],
  ["Phones", "📟"],
  ["Computers", "💻"],
  ["Clothing", "👕"],
  ["Shoes", "👟"],
  ["Home", "🏠"],
  ["Furniture", "🛋"],
  ["Vehicles", "🚗"],
  ["Services", "🛠"],
  ["Other", "📦"],
];

async function seed() {
  console.log("🌱 Seeding database...\n");

  // 1) Categories ----------------------------------------------------------
  for (const [name, emoji] of CATEGORIES) {
    await prisma.category.upsert({
      where: { name },
      create: { name, emoji, description: `${name} category` },
      update: { emoji },
    });
  }
  console.log(`✔ ${CATEGORIES.length} categories ready`);

  // 2) Demo seller #1 -------------------------------------------------------
  const demoSeller1 = await prisma.user.upsert({
    where: { telegramId: BigInt(999999001) },
    create: {
      telegramId: BigInt(999999001),
      username: "demo_seller_one",
      firstName: "Demo",
      lastName: "Seller",
      phone: "+251911000001",
      role: "SELLER",
    },
    update: {},
  });
  const profile1 = await prisma.sellerProfile.upsert({
    where: { userId: demoSeller1.id },
    create: {
      userId: demoSeller1.id,
      shopName: "Demo Electronics Shop",
      description: "Demo shop — sells electronics and gadgets.",
      location: "Addis Ababa",
      phone: "+251911000001",
      approved: true,
      status: "ACTIVE",
    },
    update: { approved: true, status: "ACTIVE" },
  });

  await seedProducts(profile1, 1);
  console.log("✔ Demo seller #1 (id 999999001) with 3 approved products");

  // 3) Demo seller #2 -------------------------------------------------------
  const demoSeller2 = await prisma.user.upsert({
    where: { telegramId: BigInt(999999002) },
    create: {
      telegramId: BigInt(999999002),
      username: "demo_seller_two",
      firstName: "Demo",
      lastName: "Clothier",
      phone: "+251911000002",
      role: "SELLER",
    },
    update: {},
  });
  const profile2 = await prisma.sellerProfile.upsert({
    where: { userId: demoSeller2.id },
    create: {
      userId: demoSeller2.id,
      shopName: "Demo Fashion Store",
      description: "Demo shop — clothing and shoes.",
      location: "Hawassa",
      phone: "+251911000002",
      approved: true,
      status: "ACTIVE",
    },
    update: { approved: true, status: "ACTIVE" },
  });
  await seedProducts(profile2, 2);
  console.log("✔ Demo seller #2 (id 999999002) with 2 approved products");

  console.log(
    "\n✅ Seeding complete.\n" +
      "   Tip: search product names like 'phone' to test search.\n" +
      "   Tip: demo products are marked \"[DEMO]\"."
  );
}

async function seedProducts(profile, sellerNo) {
  const cat = async (name) =>
    (await prisma.category.findUnique({ where: { name } })).id;

  const demo = sellerNo === 1
    ? [
        {
          name: "[DEMO] Smartphone X1",
          desc: "Demo product. 6.5inch display, dual camera, 128GB storage.",
          cat: "Phones",
          price: 15500,
          stock: 12,
        },
        {
          name: "[DEMO] Wireless Earbuds",
          desc: "Demo product. Bluetooth 5.3, 24h battery with case.",
          cat: "Electronics",
          price: 950,
          stock: 30,
        },
        {
          name: "[DEMO] Laptop Pro 14",
          desc: "Demo product. 16GB RAM, 512GB SSD, long battery.",
          cat: "Computers",
          price: 62000,
          stock: 5,
        },
      ]
    : [
        {
          name: "[DEMO] Classic T-Shirt",
          desc: "Demo product. 100% cotton, multiple sizes.",
          cat: "Clothing",
          price: 400,
          stock: 50,
        },
        {
          name: "[DEMO] Running Shoes",
          desc: "Demo product. Lightweight sole, EU sizes 39-45.",
          cat: "Shoes",
          price: 1800,
          stock: 20,
        },
      ];

  for (const p of demo) {
    const existing = await prisma.product.findFirst({
      where: { sellerId: profile.id, name: p.name },
    });
    if (!existing) {
      await prisma.product.create({
        data: {
          sellerId: profile.id,
          categoryId: await cat(p.cat),
          name: p.name,
          description: p.desc,
          price: p.price,
          currency: "ETB",
          stock: p.stock,
          status: "APPROVED",
        },
      });
    }
  }
}

seed()
  .catch((err) => {
    console.error("Seed failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => disconnect());