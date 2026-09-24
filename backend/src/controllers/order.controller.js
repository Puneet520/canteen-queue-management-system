const prisma = require("../config/db");
const { asyncHandler } = require("../middleware/errorHandler");
const {
  getQueuePosition,
  estimateWaitMinutes,
  generateToken,
  generatePickupPin,
  getCrowdStatus,
  ACTIVE_STATUSES,
} = require("../utils/queue");
const {
  emitOrderUpdate,
  emitAdminOrdersChanged,
  emitDisplayOrdersChanged,
  emitMenuStockChanged,
  emitCrowdUpdated,
} = require("../sockets");
const {
  getAvailableSlots,
  getTodayDateString,
  isOrderInCookingWindow,
  formatSlotLabel,
  MAX_SLOT_CAPACITY,
  PREP_WINDOW_MINUTES,
  isValidSlot,
} = require("../utils/slots");

function serializeOrder(order, position, reviewedItemIds) {
  const inWindow = isOrderInCookingWindow(order.scheduledSlot, order.scheduledDate);
  return {
    id: order.id,
    token: order.token,
    pickupPin: order.pickupPin,
    status: order.status,
    paymentStatus: order.paymentAttempts?.[0]?.status || null,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    startedPrepAt: order.startedPrepAt,
    readyAt: order.readyAt,
    collectedAt: order.collectedAt,
    scheduledSlot: order.scheduledSlot || null,
    scheduledSlotLabel: order.scheduledSlot ? formatSlotLabel(order.scheduledSlot) : null,
    scheduledDate: order.scheduledDate || null,
    tableNumber: order.tableNumber || null,
    isScheduled: Boolean(order.scheduledSlot),
    isInCookingWindow: inWindow,
    items: (order.items || []).map((i) => ({
      id: i.id,
      menuItemId: i.menuItemId,
      name: i.menuItem?.name || "Item",
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      prepTimeMinutes: i.menuItem?.prepTimeMinutes || 4,
      station: i.menuItem?.station || "Main",
      reviewed: reviewedItemIds ? reviewedItemIds.has(i.menuItemId) : false,
    })),
    queuePosition: inWindow ? position : null,
    estimatedWaitMinutes: inWindow ? estimateWaitMinutes(position, order.items, order.status) : null,
  };
}

// POST /api/orders — place a pre-order (FR-5, FR-6, FR-7)
// Stock check and decrement are performed atomically to prevent overselling.
const createOrder = asyncHandler(async (req, res) => {
  const { items, scheduledSlot, tableNumber } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const todayStr = getTodayDateString();
  let targetSlot = null;
  let targetDate = null;

  if (scheduledSlot && typeof scheduledSlot === "string" && scheduledSlot.trim()) {
    const trimmed = scheduledSlot.trim();
    if (!isValidSlot(trimmed)) {
      return res.status(400).json({ error: `Invalid pickup slot: "${scheduledSlot}".` });
    }

    const [startTime] = trimmed.split("-");
    const [h, m] = startTime.split(":").map(Number);
    const slotStartMinutes = h * 60 + m;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    if (slotStartMinutes <= currentMinutes + PREP_WINDOW_MINUTES) {
      return res.status(400).json({
        error: `Slot "${formatSlotLabel(trimmed)}" is no longer available for pre-order. Please pick a later slot or choose "Prepare Now".`,
      });
    }

    targetSlot = trimmed;
    targetDate = todayStr;
  }

  const order = await prisma.$transaction(async (tx) => {
    let total = 0;
    const orderItemsData = [];

    // Check slot capacity under transaction lock if scheduling
    if (targetSlot) {
      const slotBookedCount = await tx.order.count({
        where: {
          scheduledDate: targetDate,
          scheduledSlot: targetSlot,
          status: { notIn: ["CANCELLED"] },
        },
      });

      if (slotBookedCount >= MAX_SLOT_CAPACITY) {
        throw Object.assign(
          new Error(
            `Break slot "${formatSlotLabel(targetSlot)}" has reached maximum capacity (${MAX_SLOT_CAPACITY} orders). Please choose another slot.`
          ),
          { status: 409 }
        );
      }
    }

    for (const line of items) {
      const menuItem = await tx.menuItem.findUnique({
        where: { id: line.menuItemId },
      });

      if (!menuItem || !menuItem.isAvailable) {
        throw Object.assign(
          new Error(`${menuItem?.name || "Item"} is not available`),
          { status: 409 }
        );
      }

      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw Object.assign(
          new Error(`Invalid quantity for ${menuItem.name}`),
          { status: 400 }
        );
      }

      // Check and decrement stock in one database operation.
      // PostgreSQL will only update the row if enough stock remains.
      const updatedMenuItem = await tx.menuItem.updateMany({
        where: {
          id: menuItem.id,
          stockQty: {
            gte: line.quantity,
          },
        },
        data: {
          stockQty: {
            decrement: line.quantity,
          },
        },
      });

      if (updatedMenuItem.count !== 1) {
        throw Object.assign(
          new Error(`Not enough stock for ${menuItem.name}`),
          { status: 409 }
        );
      }

      // Get the remaining stock.
      const remainingItem = await tx.menuItem.findUnique({
        where: { id: menuItem.id },
      });

      // If stock reaches zero, mark the item unavailable.
      if (remainingItem.stockQty === 0 && remainingItem.isAvailable) {
        await tx.menuItem.update({
          where: { id: menuItem.id },
          data: { isAvailable: false },
        });
      }

      const unitPrice = menuItem.price;

      total += Number(unitPrice) * line.quantity;

      orderItemsData.push({
        menuItemId: menuItem.id,
        quantity: line.quantity,
        unitPrice,
      });
    }

    const sequenceHint = await tx.order.count();
    const pin = generatePickupPin();

    const created = await tx.order.create({
      data: {
        userId: req.user.id,
        token: generateToken(sequenceHint),
        pickupPin: pin,
        totalAmount: total,
        status: "PENDING",
        scheduledSlot: targetSlot,
        scheduledDate: targetDate,
        tableNumber: tableNumber && typeof tableNumber === "string" ? tableNumber.trim() : null,
        items: {
          create: orderItemsData,
        },
      },
      include: {
        items: {
          include: {
            menuItem: true,
          },
        },
        paymentAttempts: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    return created;
  });

  const inWindow = isOrderInCookingWindow(order.scheduledSlot, order.scheduledDate);
  const position = inWindow ? await getQueuePosition(prisma, order) : null;
  const estimatedMins = inWindow ? estimateWaitMinutes(position, order.items, order.status) : 0;

  const orderWithPosition = await prisma.order.update({
    where: { id: order.id },
    data: { queuePosition: position, estimatedMinutes: estimatedMins },
    include: {
      items: {
        include: {
          menuItem: true,
        },
      },
    },
  });

  const serialized = serializeOrder(orderWithPosition, position);

  emitAdminOrdersChanged({
    type: "created",
    order: serialized,
  });

  if (inWindow) {
    emitDisplayOrdersChanged({
      type: "created",
      order: {
        id: serialized.id,
        token: serialized.token,
        status: serialized.status,
        queuePosition: serialized.queuePosition,
        estimatedWaitMinutes: serialized.estimatedWaitMinutes,
        createdAt: serialized.createdAt,
        updatedAt: serialized.updatedAt,
      },
    });
  }

  // Tell all connected clients that menu stock has changed.
  const updatedMenuItems = await prisma.menuItem.findMany({
    orderBy: { name: "asc" },
  });

  emitMenuStockChanged(updatedMenuItems);
  emitCrowdUpdated(await getCrowdStatus(prisma));

  res.status(201).json({ order: serialized });
});

// GET /api/orders/mine — a user's own orders, most recent first, with live queue position
const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      items: { include: { menuItem: true } },
      paymentAttempts: { orderBy: { createdAt: "desc" }, take: 1 },
    },
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
    include: {
      items: { include: { menuItem: true } },
      paymentAttempts: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.userId !== req.user.id && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Not your order" });
  }

  // Which of this order's items the current user has already reviewed,
  // so the "rate your meal" UI can hide the ones that are done.
  let reviewedItemIds;
  if (order.status === "COLLECTED") {
    const myReviews = await prisma.review.findMany({
      where: { orderId: order.id, userId: req.user.id },
      select: { menuItemId: true },
    });
    reviewedItemIds = new Set(myReviews.map((r) => r.menuItemId));
  }

  const position = await getQueuePosition(prisma, order);
  res.json({ order: serializeOrder(order, position, reviewedItemIds) });
});

// POST /api/orders/:id/cancel
// Students can cancel only PENDING orders.
// Cancelled items are returned to inventory.
const cancelOrder = asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      items: true,
      paymentAttempts: { orderBy: { createdAt: "desc" }, take: 1 },
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
  if (order.status !== "PENDING" && order.status !== "PENDING_PAYMENT") {
    return res.status(409).json({
      error: "Order can only be cancelled while it is pending",
    });
  }

  let stockRestored = false;
  const cancelledOrder = await prisma.$transaction(async (tx) => {
    const currentOrder = await tx.order.findUnique({
      where: { id: order.id },
      include: { items: true, paymentAttempts: true },
    });
    if (!currentOrder) {
      throw Object.assign(new Error("Order not found"), { status: 404 });
    }

    const capturedPayment = currentOrder.paymentAttempts.find((payment) => payment.status === "CAPTURED");
    const shouldRestoreStock = !capturedPayment;
    const cancelled = await tx.order.updateMany({
      where: {
        id: order.id,
        status: { in: ["PENDING", "PENDING_PAYMENT"] },
      },
      data: { status: "CANCELLED", paymentExpiresAt: null, queuePosition: null, estimatedMinutes: 0 },
    });
    if (cancelled.count !== 1) {
      throw Object.assign(new Error("Order can no longer be cancelled"), { status: 409 });
    }

    if (shouldRestoreStock) {
      stockRestored = true;
      // Restore each item's stock only for an unpaid reservation or legacy unpaid order.
      for (const item of currentOrder.items) {
        await tx.menuItem.update({
          where: { id: item.menuItemId },
          data: {
            stockQty: { increment: item.quantity },
            isAvailable: true,
          },
        });
      }
    }

    if (capturedPayment) {
      await tx.payment.updateMany({
        where: { id: capturedPayment.id, status: "CAPTURED" },
        data: { status: "REFUND_REQUIRED", failureReason: "Order cancelled after payment capture" },
      });
    } else {
      await tx.payment.updateMany({
        where: { orderId: order.id, status: { in: ["CREATED", "AUTHORIZED"] } },
        data: { status: "FAILED", failureReason: "Order cancelled" },
      });
    }
    return tx.order.findUnique({
      where: { id: order.id },
      include: {
        items: {
          include: {
            menuItem: true,
          },
        },
        paymentAttempts: { orderBy: { createdAt: "desc" }, take: 1 },
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

  // Tell all connected clients that menu stock has changed.
  if (stockRestored) {
    const updatedMenuItems = await prisma.menuItem.findMany({
      orderBy: { name: "asc" },
    });

    emitMenuStockChanged(updatedMenuItems);
    emitCrowdUpdated(await getCrowdStatus(prisma));
  }

  res.json({ order: serialized });
});

// GET /api/orders/display — public endpoint for the canteen TV display screen
const getDisplayOrders = asyncHandler(async (req, res) => {
  const activeOrders = await prisma.order.findMany({
    where: {
      status: { in: ["PENDING", "PREPARING", "READY"] },
    },
    orderBy: { createdAt: "asc" },
    include: {
      items: {
        include: { menuItem: true },
      },
    },
    take: 60,
  });

  const preparing = [];
  const ready = [];

  for (const order of activeOrders) {
    // Only display orders that are in the active cooking window
    if (!isOrderInCookingWindow(order.scheduledSlot, order.scheduledDate)) {
      continue;
    }

    const pos = await getQueuePosition(prisma, order);
    const eta = estimateWaitMinutes(pos, order.items, order.status);
    const payload = {
      id: order.id,
      token: order.token,
      status: order.status,
      queuePosition: pos,
      estimatedWaitMinutes: eta,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      readyAt: order.readyAt,
    };

    if (order.status === "READY") {
      ready.push(payload);
    } else {
      preparing.push(payload);
    }
  }

  // Sort ready orders newest first so recently called tokens appear at top
  ready.sort((a, b) => new Date(b.readyAt || b.updatedAt) - new Date(a.readyAt || a.updatedAt));

  res.json({ preparing, ready });
});

// GET /api/orders/slots — public endpoint for break slots with remaining capacities
const getSlots = asyncHandler(async (req, res) => {
  const data = await getAvailableSlots(prisma);
  res.json(data);
});

// POST /api/orders/:id/verify-pin — staff verifies 4-digit PIN at pickup counter
const verifyPickupPin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { pin } = req.body;

  if (!pin) {
    return res.status(400).json({ error: "4-digit pickup PIN is required" });
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { include: { menuItem: true } } },
  });

  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  if (order.status !== "READY" && order.status !== "PREPARING") {
    return res.status(400).json({ error: `Order is already ${order.status}` });
  }

  if (order.pickupPin !== pin.trim()) {
    return res.status(400).json({ error: "Incorrect 4-digit PIN. Please verify with the student." });
  }

  const collectedOrder = await prisma.order.update({
    where: { id },
    data: {
      status: "COLLECTED",
      collectedAt: new Date(),
    },
    include: { items: { include: { menuItem: true } } },
  });

  const serialized = serializeOrder(collectedOrder, null);

  emitOrderUpdate(collectedOrder.userId, serialized);
  emitAdminOrdersChanged({ type: "updated", order: serialized });
  emitDisplayOrdersChanged({ type: "collected", order: serialized });
  emitCrowdUpdated(await getCrowdStatus(prisma));

  res.json({ success: true, order: serialized });
});

// GET /api/orders/crowd — public live crowd metrics & rush velocity
const getCrowdMetrics = asyncHandler(async (req, res) => {
  const metrics = await getCrowdStatus(prisma);
  res.json(metrics);
});

module.exports = {
  createOrder,
  getMyOrders,
  getOrder,
  cancelOrder,
  getDisplayOrders,
  getSlots,
  getCrowdMetrics,
  verifyPickupPin,
  serializeOrder,
};
