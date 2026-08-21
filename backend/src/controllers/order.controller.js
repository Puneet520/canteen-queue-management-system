const prisma = require("../config/db");
const { asyncHandler } = require("../middleware/errorHandler");
const { getQueuePosition, estimateWaitMinutes, generateToken, ACTIVE_STATUSES } = require("../utils/queue");
const { emitOrderUpdate, emitAdminOrdersChanged } = require("../sockets");

function serializeOrder(order, position) {
  return {
    id: order.id,
    token: order.token,
    status: order.status,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items.map((i) => ({
      name: i.menuItem.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    })),
    queuePosition: position,
    estimatedWaitMinutes: estimateWaitMinutes(position),
  };
}

// POST /api/orders — place a pre-order (FR-5, FR-6, FR-7)
// Cart items are decremented from stock atomically, so two students can't
// both "win" the last plate of something (NFR-5).
const createOrder = asyncHandler(async (req, res) => {
  const { items } = req.body; // [{ menuItemId, quantity }]

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const order = await prisma.$transaction(async (tx) => {
    let total = 0;
    const orderItemsData = [];

    for (const line of items) {
      const menuItem = await tx.menuItem.findUnique({ where: { id: line.menuItemId } });

      if (!menuItem || !menuItem.isAvailable) {
        throw Object.assign(new Error(`${menuItem?.name || "Item"} is not available`), { status: 409 });
      }
      if (menuItem.stockQty < line.quantity) {
        throw Object.assign(new Error(`Not enough stock for ${menuItem.name}`), { status: 409 });
      }

      // Atomic decrement — combined with the stockQty check above inside
      // the same transaction, this prevents overselling under concurrent orders.
      await tx.menuItem.update({
        where: { id: menuItem.id },
        data: {
          stockQty: { decrement: line.quantity },
          isAvailable: menuItem.stockQty - line.quantity > 0,
        },
      });

      const unitPrice = menuItem.price;
      total += Number(unitPrice) * line.quantity;
      orderItemsData.push({ menuItemId: menuItem.id, quantity: line.quantity, unitPrice });
    }

    const sequenceHint = await tx.order.count();
    const created = await tx.order.create({
      data: {
        userId: req.user.id,
        token: generateToken(sequenceHint),
        totalAmount: total,
        status: "PENDING",
        items: { create: orderItemsData },
      },
      include: { items: { include: { menuItem: true } } },
    });

    return created;
  });

  const position = await getQueuePosition(prisma, order);
  const orderWithPosition = await prisma.order.update({
    where: { id: order.id },
    data: { queuePosition: position },
    include: { items: { include: { menuItem: true } } },
  });

  const serialized = serializeOrder(orderWithPosition, position);
  emitAdminOrdersChanged({ type: "created", order: serialized });

  res.status(201).json({ order: serialized });
});

// GET /api/orders/mine — a user's own orders, most recent first, with live queue position
const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    include: { items: { include: { menuItem: true } } },
    take: 20,
  });

  const withPositions = await Promise.all(
    orders.map(async (o) => serializeOrder(o, await getQueuePosition(prisma, o)))
  );

  res.json({ orders: withPositions });
});

// GET /api/orders/:id — single order detail + live queue position (FR-9, FR-10)
const getOrder = asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: { include: { menuItem: true } } },
  });

  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.userId !== req.user.id && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Not your order" });
  }

  const position = await getQueuePosition(prisma, order);
  res.json({ order: serializeOrder(order, position) });
});

// POST /api/orders/:id/cancel
// Students can cancel only PENDING orders.
// Cancelled items are returned to inventory.
const cancelOrder = asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      items: true,
    },
  });

  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  // A student can cancel only their own order.
  if (order.userId !== req.user.id) {
    return res.status(403).json({ error: "Not your order" });
  }

  // Once preparation has started, cancellation is no longer allowed.
  if (order.status !== "PENDING") {
    return res.status(409).json({
      error: "Order can only be cancelled while it is pending",
    });
  }

  const cancelledOrder = await prisma.$transaction(async (tx) => {
    // Restore each item's stock.
    for (const item of order.items) {
      await tx.menuItem.update({
        where: { id: item.menuItemId },
        data: {
          stockQty: { increment: item.quantity },
          isAvailable: true,
        },
      });
    }

    // Mark the order as cancelled.
    return tx.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
      },
      include: {
        items: {
          include: {
            menuItem: true,
          },
        },
      },
    });
  });

  const serialized = serializeOrder(cancelledOrder, null);

  // Update the student's page immediately.
  emitOrderUpdate(req.user.id, serialized);

  // Update all connected admin dashboards immediately.
  emitAdminOrdersChanged({
    type: "cancelled",
    order: serialized,
  });

  res.json({ order: serialized });
});

module.exports = {
  createOrder,
  getMyOrders,
  getOrder,
  cancelOrder,
  serializeOrder,
};
