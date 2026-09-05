const prisma = require("../config/db");
const { asyncHandler } = require("../middleware/errorHandler");
const { emitMenuStockChanged } = require("../sockets");

const FOOD_TYPES = ["VEG", "NON_VEG", "EGG"];

function normalizeAllergens(value) {
  if (Array.isArray(value)) {
    return value.map((a) => String(a).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
  }
  return [];
}

function toIntOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// Maps request body -> Prisma data for the descriptive "rich" menu fields.
// Only includes keys that were actually provided, so it is safe to spread
// into both create and update payloads.
function richMenuFields(body) {
  const data = {};
  if (body.imageUrl !== undefined) data.imageUrl = (body.imageUrl || "").trim() || null;
  if (body.foodType !== undefined && FOOD_TYPES.includes(body.foodType)) data.foodType = body.foodType;
  if (body.isJain !== undefined) data.isJain = Boolean(body.isJain);
  if (body.allergens !== undefined) data.allergens = normalizeAllergens(body.allergens);
  if (body.calories !== undefined) data.calories = toIntOrNull(body.calories);
  if (body.protein !== undefined) data.protein = toIntOrNull(body.protein);
  if (body.carbs !== undefined) data.carbs = toIntOrNull(body.carbs);
  if (body.fat !== undefined) data.fat = toIntOrNull(body.fat);
  if (body.prepTimeMinutes !== undefined) {
    const n = toIntOrNull(body.prepTimeMinutes);
    if (n && n > 0) data.prepTimeMinutes = n;
  }
  if (body.station !== undefined && body.station) data.station = body.station;
  return data;
}

// GET /api/menu — public, only shows items marked available (FR-3, FR-4)
const listMenu = asyncHandler(async (req, res) => {
  const items = await prisma.menuItem.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  res.json({ items });
});

// GET /api/menu/all — admin view, includes hidden/out-of-stock items
const listMenuAdmin = asyncHandler(async (req, res) => {
  const items = await prisma.menuItem.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  res.json({ items });
});

// POST /api/menu — admin only (FR-14)
const createMenuItem = asyncHandler(async (req, res) => {
  const { name, description, price, category, stockQty } = req.body;

  if (!name || price == null) {
    return res.status(400).json({ error: "name and price are required" });
  }

  const item = await prisma.menuItem.create({
    data: {
      name,
      description: description || null,
      price,
      category: category || "General",
      stockQty: stockQty ?? 0,
      isAvailable: (stockQty ?? 0) > 0,
      ...richMenuFields(req.body),
    },
  });

  // Get the latest menu so all connected student pages can update.
  const updatedMenuItems = await prisma.menuItem.findMany({
    orderBy: { name: "asc" },
  });

  emitMenuStockChanged(updatedMenuItems);

  res.status(201).json({ item });
});

// PUT /api/menu/:id — admin only (FR-14)
const updateMenuItem = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { name, description, price, category, stockQty, isAvailable } = req.body;

  const item = await prisma.menuItem.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(price !== undefined && { price }),
      ...(category !== undefined && { category }),
      ...(stockQty !== undefined && { stockQty }),
      ...(isAvailable !== undefined && { isAvailable }),
      ...richMenuFields(req.body),
    },
  });

  // Get the latest menu so all connected student pages can update.
  const updatedMenuItems = await prisma.menuItem.findMany({
    orderBy: { name: "asc" },
  });

  emitMenuStockChanged(updatedMenuItems);

  res.json({ item });
});

// DELETE /api/menu/:id — admin only (FR-14)
const deleteMenuItem = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await prisma.menuItem.delete({ where: { id } });

  // Get the latest menu so all connected student pages can update.
  const updatedMenuItems = await prisma.menuItem.findMany({
    orderBy: { name: "asc" },
  });

  emitMenuStockChanged(updatedMenuItems);

  res.status(204).send();
});

module.exports = { listMenu, listMenuAdmin, createMenuItem, updateMenuItem, deleteMenuItem };
