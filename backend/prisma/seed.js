// Run with: npx prisma db seed
// Creates one admin login and a handful of menu items so the app is
// usable immediately after `prisma migrate dev`.

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

// Demo images use loremflickr (keyword-based placeholder photos, stable via
// ?lock). Admins can paste exact image URLs from the dashboard; the menu card
// falls back to a food emoji if an image ever fails to load.
function demoImage(keywords, lock) {
  return `https://loremflickr.com/600/400/${keywords}?lock=${lock}`;
}

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
    {
      name: "Veg Sandwich",
      description: "Grilled sandwich stuffed with fresh veggies and mint chutney.",
      price: 40,
      category: "Snacks",
      stockQty: 25,
      prepTimeMinutes: 4,
      station: "Snacks",
      imageUrl: demoImage("veg,sandwich", 11),
      foodType: "VEG",
      isJain: false,
      allergens: ["Gluten", "Dairy"],
      calories: 250,
      protein: 8,
      carbs: 34,
      fat: 9,
    },
    {
      name: "Masala Dosa",
      description: "Crispy rice crepe with a spiced potato filling, sambar & chutney.",
      price: 60,
      category: "South Indian",
      stockQty: 15,
      prepTimeMinutes: 6,
      station: "Grill / South Indian",
      imageUrl: demoImage("masala,dosa", 12),
      foodType: "VEG",
      isJain: false,
      allergens: ["Gluten"],
      calories: 380,
      protein: 9,
      carbs: 60,
      fat: 12,
    },
    {
      name: "Cold Coffee",
      description: "Chilled, frothy coffee blended with milk and a hint of chocolate.",
      price: 35,
      category: "Beverages",
      stockQty: 30,
      prepTimeMinutes: 2,
      station: "Beverages",
      imageUrl: demoImage("cold,coffee", 13),
      foodType: "VEG",
      isJain: false,
      allergens: ["Dairy"],
      calories: 180,
      protein: 5,
      carbs: 26,
      fat: 6,
    },
    {
      name: "Samosa",
      description: "Golden fried pastry with a spiced potato-pea filling. Jain-friendly.",
      price: 15,
      category: "Snacks",
      stockQty: 40,
      prepTimeMinutes: 1,
      station: "Snacks",
      imageUrl: demoImage("samosa", 14),
      foodType: "VEG",
      isJain: true,
      allergens: ["Gluten"],
      calories: 150,
      protein: 3,
      carbs: 18,
      fat: 8,
    },
    {
      name: "Veg Thali",
      description: "Wholesome platter: dal, sabzi, rice, 3 rotis, salad & sweet.",
      price: 90,
      category: "Meals",
      stockQty: 20,
      prepTimeMinutes: 3,
      station: "Meals",
      imageUrl: demoImage("indian,thali", 15),
      foodType: "VEG",
      isJain: false,
      allergens: ["Gluten", "Dairy"],
      calories: 650,
      protein: 18,
      carbs: 92,
      fat: 20,
    },
    {
      name: "Chicken Roll",
      description: "Flaky paratha wrap loaded with spiced grilled chicken & onions.",
      price: 80,
      category: "Snacks",
      stockQty: 18,
      prepTimeMinutes: 5,
      station: "Grill",
      imageUrl: demoImage("chicken,wrap", 16),
      foodType: "NON_VEG",
      isJain: false,
      allergens: ["Gluten"],
      calories: 420,
      protein: 26,
      carbs: 38,
      fat: 18,
    },
    {
      name: "Egg Bhurji",
      description: "Masala-scrambled eggs with onion & tomato, served with pav.",
      price: 55,
      category: "Meals",
      stockQty: 22,
      prepTimeMinutes: 4,
      station: "Grill",
      imageUrl: demoImage("scrambled,eggs", 17),
      foodType: "EGG",
      isJain: false,
      allergens: ["Egg", "Gluten"],
      calories: 300,
      protein: 16,
      carbs: 20,
      fat: 17,
    },
  ];

  for (const item of items) {
    const existing = await prisma.menuItem.findFirst({ where: { name: item.name } });
    if (!existing) {
      await prisma.menuItem.create({ data: { ...item, isAvailable: item.stockQty > 0 } });
    } else {
      // Refresh descriptive fields on reseed, but leave live stock/availability alone.
      const { stockQty, ...descriptive } = item;
      await prisma.menuItem.update({
        where: { id: existing.id },
        data: descriptive,
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
