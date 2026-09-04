const prisma = require("../config/db");
const { asyncHandler } = require("../middleware/errorHandler");
const { getQueuePosition, ACTIVE_STATUSES } = require("../utils/queue");
const { serializeOrder } = require("./order.controller");
const { emitOrderUpdate, emitAdminOrdersChanged, emitDisplayOrdersChanged } = require("../sockets");

const NEXT_STATUS = {
  PENDING: "PREPARING",
  PREPARING: "READY",
  READY: "COLLECTED",
};

// GET /api/admin/orders — live dashboard, active orders first (FR-12)
const listOrders = asyncHandler(async (req, res) => {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    include: { items: { include: { menuItem: true } }, user: { select: { name: true, email: true } } },
    take: 100,
  });

  const withPositions = await Promise.all(
    orders.map(async (o) => ({
      ...serializeOrder(o, await getQueuePosition(prisma, o)),
      customer: o.user,
    }))
  );

  res.json({ orders: withPositions });
});

// GET /api/admin/kitchen — dedicated Kitchen Display System (KDS) data with batch cooking summary
const getKitchenKDS = asyncHandler(async (req, res) => {
  const activeOrders = await prisma.order.findMany({
    where: { status: { in: ["PENDING", "PREPARING", "READY"] } },
    orderBy: { createdAt: "asc" },
    include: {
      items: { include: { menuItem: true } },
      user: { select: { name: true, email: true } },
    },
  });

  const withPositions = await Promise.all(
    activeOrders.map(async (o) => ({
      ...serializeOrder(o, await getQueuePosition(prisma, o)),
      customer: o.user,
    }))
  );

  // Compute live batch cooking summary across all PENDING and PREPARING orders
  const batchMap = {};
  for (const o of activeOrders) {
    if (o.status === "PENDING" || o.status === "PREPARING") {
      for (const itm of o.items) {
        const name = itm.menuItem?.name || "Item";
        const station = itm.menuItem?.station || "Main";
        if (!batchMap[name]) {
          batchMap[name] = { count: 0, station, name };
        }
        batchMap[name].count += itm.quantity;
      }
    }
  }

  const batchSummary = Object.values(batchMap).sort((a, b) => b.count - a.count);

  res.json({
    orders: withPositions,
    batchSummary,
    counts: {
      pending: activeOrders.filter((o) => o.status === "PENDING").length,
      preparing: activeOrders.filter((o) => o.status === "PREPARING").length,
      ready: activeOrders.filter((o) => o.status === "READY").length,
    },
  });
});

// PATCH /api/admin/orders/:id/status — advance an order's status (FR-13)
// Accepts an explicit target status, or omit `status` to auto-advance to the next stage.
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "Order not found" });

  const targetStatus = status || NEXT_STATUS[existing.status];
  if (!targetStatus) {
    return res.status(400).json({ error: `Order is already ${existing.status}` });
  }

  const updateData = { status: targetStatus };
  if (targetStatus === "PREPARING" && !existing.startedPrepAt) {
    updateData.startedPrepAt = new Date();
  } else if (targetStatus === "READY" && !existing.readyAt) {
    updateData.readyAt = new Date();
  } else if (targetStatus === "COLLECTED" && !existing.collectedAt) {
    updateData.collectedAt = new Date();
  }

  const updated = await prisma.order.update({
    where: { id },
    data: updateData,
    include: { items: { include: { menuItem: true } } },
  });

  const position = await getQueuePosition(prisma, updated);
  const serialized = serializeOrder(updated, position);

  // Push the update to the student/faculty member who placed it (FR-16).
  emitOrderUpdate(updated.userId, serialized);

  // Re-broadcast queue positions to every order still active, since one
  // order leaving the queue shifts everyone else's position (FR-9).
  const activeOrders = await prisma.order.findMany({
    where: { status: { in: ACTIVE_STATUSES } },
    orderBy: { createdAt: "asc" },
    include: { items: { include: { menuItem: true } } },
  });
  for (const o of activeOrders) {
    const pos = await getQueuePosition(prisma, o);
    emitOrderUpdate(o.userId, serializeOrder(o, pos));
  }

  emitAdminOrdersChanged({ type: "updated", order: serialized });

  // Push update to public canteen TV display
  emitDisplayOrdersChanged({
    type: "updated",
    justReady: targetStatus === "READY",
    token: updated.token,
    order: serialized,
  });

  res.json({ order: serialized });
});

// GET /api/admin/summary — today's order count and items sold (FR-15)
const getDailySummary = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: startOfDay }, status: { not: "CANCELLED" } },
    include: { items: true },
  });

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
  const itemsSold = orders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);

  res.json({ date: startOfDay, totalOrders, totalRevenue, itemsSold });
});

module.exports = { listOrders, getKitchenKDS, updateOrderStatus, getDailySummary };
