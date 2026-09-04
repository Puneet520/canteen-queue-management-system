// Run with: npx prisma db seed
// Creates one admin login and a handful of menu items so the app is
// usable immediately after `prisma migrate dev`.

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const adminPasswordHash = await bcrypt.hash("Admin@123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@canteen.edu" },
    update: {},
    create: {
      name: "Canteen Admin",
      email: "admin@canteen.edu",
      passwordHash: adminPasswordHash,
      role: "ADMIN",
    },
  });

  const items = [
    { name: "Veg Sandwich", price: 40, category: "Snacks", stockQty: 25, prepTimeMinutes: 4, station: "Snacks" },
    { name: "Masala Dosa", price: 60, category: "South Indian", stockQty: 15, prepTimeMinutes: 6, station: "Grill / South Indian" },
    { name: "Cold Coffee", price: 35, category: "Beverages", stockQty: 30, prepTimeMinutes: 2, station: "Beverages" },
    { name: "Samosa", price: 15, category: "Snacks", stockQty: 40, prepTimeMinutes: 1, station: "Snacks" },
    { name: "Veg Thali", price: 90, category: "Meals", stockQty: 20, prepTimeMinutes: 3, station: "Meals" },
  ];

  for (const item of items) {
    const existing = await prisma.menuItem.findFirst({ where: { name: item.name } });
    if (!existing) {
      await prisma.menuItem.create({ data: { ...item, isAvailable: item.stockQty > 0 } });
    } else {
      await prisma.menuItem.update({
        where: { id: existing.id },
        data: {
          prepTimeMinutes: item.prepTimeMinutes,
          station: item.station,
        },
      });
    }
  }

  console.log("Seed complete.");
  console.log("Admin login -> email: admin@canteen.edu | password: Admin@123");
  console.log(`Seeded ${items.length} menu items.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
