const prisma = require("../config/db");
const { asyncHandler } = require("../middleware/errorHandler");
const { emitMenuStockChanged } = require("../sockets");

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
