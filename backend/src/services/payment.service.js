const crypto = require("crypto");
const Razorpay = require("razorpay");
const prisma = require("../config/db");
const {
  getQueuePosition,
  estimateWaitMinutes,
} = require("../utils/queue");
const {
  emitOrderUpdate,
  emitAdminOrdersChanged,
  emitDisplayOrdersChanged,
  emitMenuStockChanged,
  emitCrowdUpdated,
} = require("../sockets");
const { getCrowdStatus } = require("../utils/queue");
const { formatSlotLabel, isOrderInCookingWindow } = require("../utils/slots");

const PAYMENT_RESERVATION_MINUTES = 15;
const PAYMENT_CURRENCY = "INR";

let razorpayClient;

function getRazorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    const error = new Error("Razorpay is not configured on the server");
    error.status = 503;
    throw error;
  }

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }

  return razorpayClient;
}

function amountToPaise(amount) {
  const value = String(amount);
  const [whole, fraction = ""] = value.split(".");
  const normalizedFraction = `${fraction}00`.slice(0, 2);
  return BigInt(whole) * 100n + BigInt(normalizedFraction);
}

function paiseToAmount(paise) {
  const value = BigInt(String(paise));
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

function verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, signature) {
  if (!signature || !process.env.RAZORPAY_KEY_SECRET) return false;

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  return expected.length === signature.length && crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}

function verifyWebhookSignature(rawBody, signature) {
  if (!signature || !process.env.RAZORPAY_WEBHOOK_SECRET) return false;

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  return expected.length === signature.length && crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature)
  );
}

function serializePaymentOrder(order, position = null) {
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
    items: (order.items || []).map((item) => ({
      id: item.id,
      menuItemId: item.menuItemId,
      name: item.menuItem?.name || "Item",
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      prepTimeMinutes: item.menuItem?.prepTimeMinutes || 4,
      station: item.menuItem?.station || "Main",
    })),
    queuePosition: inWindow ? position : null,
    estimatedWaitMinutes: inWindow
      ? estimateWaitMinutes(position, order.items, order.status)
      : null,
  };
}

const orderInclude = {
  items: { include: { menuItem: true } },
};

async function publishOrder(order, type = "updated") {
  const position = await getQueuePosition(prisma, order);
  const serialized = serializePaymentOrder(order, position);

  emitOrderUpdate(order.userId, serialized);
  emitAdminOrdersChanged({ type, order: serialized });

  if (order.status === "PENDING" || order.status === "PREPARING" || order.status === "READY") {
    emitDisplayOrdersChanged({
      type,
      justReady: order.status === "READY",
      token: order.token,
      order: serialized,
    });
  }

  return serialized;
}

async function publishStockAndCrowd() {
  const updatedMenuItems = await prisma.menuItem.findMany({ orderBy: { name: "asc" } });
  emitMenuStockChanged(updatedMenuItems);
  emitCrowdUpdated(await getCrowdStatus(prisma));
}

async function restoreReservedStock(tx, items) {
  for (const item of items) {
    const restored = await tx.menuItem.update({
      where: { id: item.menuItemId },
      data: {
        stockQty: { increment: item.quantity },
        isAvailable: true,
      },
    });

    if (restored.stockQty <= 0) {
      await tx.menuItem.update({
        where: { id: item.menuItemId },
        data: { isAvailable: false },
      });
    }
  }
}

async function createPendingPaymentOrder({ userId, items, targetSlot, targetDate, tableNumber }) {
  const expiresAt = new Date(Date.now() + PAYMENT_RESERVATION_MINUTES * 60 * 1000);
  const order = await prisma.$transaction(async (tx) => {
    let total = 0;
    const orderItemsData = [];

    for (const line of items) {
      const menuItem = await tx.menuItem.findUnique({ where: { id: line.menuItemId } });
      if (!menuItem || !menuItem.isAvailable) {
        throw Object.assign(new Error(`${menuItem?.name || "Item"} is not available`), { status: 409 });
      }
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw Object.assign(new Error(`Invalid quantity for ${menuItem.name}`), { status: 400 });
      }

      const reserved = await tx.menuItem.updateMany({
        where: { id: menuItem.id, stockQty: { gte: line.quantity } },
        data: { stockQty: { decrement: line.quantity } },
      });
      if (reserved.count !== 1) {
        throw Object.assign(new Error(`Not enough stock for ${menuItem.name}`), { status: 409 });
      }

      const remaining = await tx.menuItem.findUnique({ where: { id: menuItem.id } });
      if (remaining.stockQty === 0 && remaining.isAvailable) {
        await tx.menuItem.update({ where: { id: menuItem.id }, data: { isAvailable: false } });
      }

      total += Number(menuItem.price) * line.quantity;
      orderItemsData.push({ menuItemId: menuItem.id, quantity: line.quantity, unitPrice: menuItem.price });
    }

    const sequenceHint = await tx.order.count();
    return tx.order.create({
      data: {
        userId,
        token: `PAY-${sequenceHint + 1}-${Date.now().toString(36).slice(-5).toUpperCase()}`,
        pickupPin: "0000",
        totalAmount: total.toFixed(2),
        status: "PENDING_PAYMENT",
        paymentExpiresAt: expiresAt,
        scheduledSlot: targetSlot,
        scheduledDate: targetDate,
        tableNumber,
        items: { create: orderItemsData },
      },
      include: orderInclude,
    });
  });

  let razorpayOrder;
  try {
    razorpayOrder = await getRazorpayClient().orders.create({
      amount: Number(amountToPaise(order.totalAmount)),
      currency: PAYMENT_CURRENCY,
      receipt: order.id,
      notes: { orderId: order.id, userId },
    });

    const payment = await prisma.$transaction(async (tx) => {
      const currentOrder = await tx.order.findUnique({
        where: { id: order.id },
        select: { status: true },
      });
      if (currentOrder?.status !== "PENDING_PAYMENT") {
        throw Object.assign(new Error("Payment reservation is no longer active"), { status: 409 });
      }

      const createdPayment = await tx.payment.create({
        data: {
          orderId: order.id,
          razorpayOrderId: razorpayOrder.id,
          amount: order.totalAmount,
          currency: PAYMENT_CURRENCY,
        },
      });

      const verifiedOrder = await tx.order.findUnique({
        where: { id: order.id },
        select: { status: true },
      });
      if (verifiedOrder?.status !== "PENDING_PAYMENT") {
        await tx.payment.update({
          where: { id: createdPayment.id },
          data: { status: "FAILED", failureReason: "Payment reservation is no longer active" },
        });
        throw Object.assign(new Error("Payment reservation is no longer active"), { status: 409 });
      }

      return createdPayment;
    });

    await publishStockAndCrowd();
    return { order, payment, razorpayKeyId: process.env.RAZORPAY_KEY_ID };
  } catch (error) {
    await cancelUnpaidOrder(order.id, "Payment initialization failed");
    throw error;
  }
}

async function cancelUnpaidOrder(orderId, reason = "Payment cancelled") {
  let stockRestored = false;
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true, paymentAttempts: true },
    });
    if (!order) return null;

    const capturedPayment = order.paymentAttempts.find((payment) => payment.status === "CAPTURED");
    if ((order.status === "PENDING" || order.status === "PENDING_PAYMENT") && capturedPayment) {
      const cancelled = await tx.order.updateMany({
        where: { id: orderId, status: { in: ["PENDING", "PENDING_PAYMENT"] } },
        data: { status: "CANCELLED", paymentExpiresAt: null, queuePosition: null, estimatedMinutes: 0 },
      });
      if (cancelled.count !== 1) return null;

      await tx.payment.updateMany({
        where: { id: capturedPayment.id, status: "CAPTURED" },
        data: { status: "REFUND_REQUIRED", failureReason: reason },
      });
      return tx.order.findUnique({
        where: { id: orderId },
        include: {
          ...orderInclude,
          paymentAttempts: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });
    }

    if (order.status !== "PENDING_PAYMENT") return null;

    const cancelled = await tx.order.updateMany({
      where: { id: orderId, status: "PENDING_PAYMENT" },
      data: { status: "CANCELLED", paymentExpiresAt: null },
    });
    if (cancelled.count !== 1) return null;
    stockRestored = true;
    await restoreReservedStock(tx, order.items);
    await tx.payment.updateMany({
      where: { orderId, status: { in: ["CREATED", "AUTHORIZED"] } },
      data: { status: "FAILED", failureReason: reason },
    });
    return tx.order.findUnique({
      where: { id: orderId },
      include: {
        ...orderInclude,
        paymentAttempts: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
  });

  if (result) {
    await publishOrder(result, "cancelled");
    if (stockRestored) await publishStockAndCrowd();
  }
  return result;
}

async function confirmPayment({ razorpayOrderId, razorpayPaymentId = null, amount, currency, method = null }) {
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { razorpayOrderId },
      include: { order: { include: { items: { include: { menuItem: true } } } } },
    });
    if (!payment) throw Object.assign(new Error("Payment order not found"), { status: 404 });

    if (payment.status === "CAPTURED" && payment.order.status === "PENDING") {
      if (razorpayPaymentId && !payment.razorpayPaymentId) {
        await tx.payment.updateMany({
          where: { id: payment.id, status: "CAPTURED", razorpayPaymentId: null },
          data: { razorpayPaymentId },
        });
      } else if (
        razorpayPaymentId &&
        payment.razorpayPaymentId &&
        payment.razorpayPaymentId !== razorpayPaymentId
      ) {
        throw Object.assign(new Error("Payment has already been confirmed with another payment ID"), { status: 409 });
      }

      const currentOrder = await tx.order.findUnique({
        where: { id: payment.orderId },
        include: {
          ...orderInclude,
          paymentAttempts: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      });
      return { order: currentOrder, alreadyConfirmed: true, refundRequired: false };
    }
    if (payment.status === "REFUND_REQUIRED" || payment.status === "REFUNDED" || payment.order.status === "CANCELLED") {
      return { order: payment.order, alreadyConfirmed: false, refundRequired: true };
    }
    if (payment.order.status !== "PENDING_PAYMENT") {
      throw Object.assign(new Error("Order is not awaiting payment"), { status: 409 });
    }
    if (payment.order.paymentExpiresAt && payment.order.paymentExpiresAt <= new Date()) {
      const expired = await tx.order.updateMany({
        where: { id: payment.orderId, status: "PENDING_PAYMENT" },
        data: { status: "CANCELLED", paymentExpiresAt: null },
      });
      if (expired.count === 1) await restoreReservedStock(tx, payment.order.items);
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "REFUND_REQUIRED", failureReason: "Payment arrived after reservation expiry", razorpayPaymentId },
      });
      const expiredOrder = await tx.order.findUnique({ where: { id: payment.orderId }, include: orderInclude });
      return { order: expiredOrder, alreadyConfirmed: false, refundRequired: true };
    }

    if (amountToPaise(payment.amount) !== BigInt(String(amount))) {
      throw Object.assign(new Error("Payment amount does not match the order"), { status: 400 });
    }
    if (currency !== payment.currency) {
      throw Object.assign(new Error("Payment currency does not match the order"), { status: 400 });
    }
    if (payment.razorpayPaymentId && payment.razorpayPaymentId !== razorpayPaymentId) {
      throw Object.assign(new Error("Payment has already been confirmed with another payment ID"), { status: 409 });
    }

    const captured = await tx.payment.updateMany({
      where: {
        id: payment.id,
        status: { in: ["CREATED", "AUTHORIZED"] },
        razorpayPaymentId: null,
      },
      data: {
        status: "CAPTURED",
        razorpayPaymentId,
        amount: payment.amount,
        currency,
        method,
        paidAt: new Date(),
        failureReason: null,
      },
    });
    if (captured.count !== 1) {
      const current = await tx.payment.findUnique({ where: { id: payment.id }, include: { order: { include: orderInclude } } });
      if (current?.status === "CAPTURED" && current.order.status === "PENDING") {
        return { order: current.order, alreadyConfirmed: true, refundRequired: false };
      }
      throw Object.assign(new Error("Payment has already been processed"), { status: 409 });
    }

    const activated = await tx.order.updateMany({
      where: { id: payment.orderId, status: "PENDING_PAYMENT" },
      data: { status: "PENDING", paymentExpiresAt: null },
    });
    if (activated.count !== 1) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "REFUND_REQUIRED", failureReason: "Order was cancelled before payment confirmation" },
      });
      const unavailableOrder = await tx.order.findUnique({ where: { id: payment.orderId }, include: orderInclude });
      return { order: unavailableOrder, alreadyConfirmed: false, refundRequired: true };
    }

    const ordersAhead = await tx.order.count({
      where: {
        status: { in: ["PENDING", "PREPARING"] },
        createdAt: { lt: payment.order.createdAt },
      },
    });
    const queuePosition = ordersAhead + 1;
    const estimatedMinutes = estimateWaitMinutes(queuePosition, payment.order.items, "PENDING");

    const queuedOrder = await tx.order.update({
      where: { id: payment.orderId },
      data: { queuePosition, estimatedMinutes },
      include: {
        ...orderInclude,
        paymentAttempts: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    return { order: queuedOrder, alreadyConfirmed: false, refundRequired: false };
  });

  if (result.refundRequired) {
    if (result.order.status === "CANCELLED") await publishStockAndCrowd();
    return result;
  }
  if (!result.alreadyConfirmed) {
    const currentOrder = await prisma.order.findUnique({
      where: { id: result.order.id },
      include: {
        ...orderInclude,
        paymentAttempts: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!currentOrder || currentOrder.status !== "PENDING") {
      return {
        order: currentOrder || result.order,
        alreadyConfirmed: false,
        refundRequired: currentOrder?.status === "CANCELLED",
      };
    }
    await publishOrder(currentOrder, "created");
    result.order = currentOrder;
  }
  return result;
}

async function expirePendingPayments() {
  const expired = await prisma.order.findMany({
    where: { status: "PENDING_PAYMENT", paymentExpiresAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const order of expired) await cancelUnpaidOrder(order.id, "Payment reservation expired");
  return expired.length;
}

async function processWebhookEvent(event) {
  const entity = event?.payload?.payment?.entity;
  const orderEntity = event?.payload?.order?.entity;
  if (event.event === "payment.captured" && entity) {
    return confirmPayment({
      razorpayOrderId: entity.order_id,
      razorpayPaymentId: entity.id,
      amount: entity.amount,
      currency: entity.currency,
      method: entity.method,
    });
  }
  if (event.event === "order.paid" && orderEntity) {
    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: orderEntity.id } });
    if (!payment) return null;
    const paymentEntity = event?.payload?.payment?.entity;
    return confirmPayment({
      razorpayOrderId: orderEntity.id,
      razorpayPaymentId: paymentEntity?.id || orderEntity.payment_id || orderEntity.paymentId || null,
      amount: orderEntity.amount_paid,
      currency: orderEntity.currency,
    });
  }
  if (event.event === "payment.failed" && entity) {
    return cancelUnpaidOrder(entity.order_id, entity.error_description || "Razorpay payment failed");
  }
  return null;
}

async function fetchPayment(paymentId) {
  return getRazorpayClient().payments.fetch(paymentId);
}

module.exports = {
  PAYMENT_RESERVATION_MINUTES,
  PAYMENT_CURRENCY,
  amountToPaise,
  paiseToAmount,
  verifyPaymentSignature,
  verifyWebhookSignature,
  createPendingPaymentOrder,
  confirmPayment,
  cancelUnpaidOrder,
  expirePendingPayments,
  processWebhookEvent,
  fetchPayment,
};
