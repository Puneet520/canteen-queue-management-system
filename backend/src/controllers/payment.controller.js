const prisma = require("../config/db");
const { asyncHandler } = require("../middleware/errorHandler");
const {
  createPendingPaymentOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchPayment,
  confirmPayment,
  cancelUnpaidOrder,
  processWebhookEvent,
  PAYMENT_CURRENCY,
} = require("../services/payment.service");
const {
  getTodayDateString,
  formatSlotLabel,
  PREP_WINDOW_MINUTES,
  MAX_SLOT_CAPACITY,
  isValidSlot,
} = require("../utils/slots");

function validateSchedule(scheduledSlot) {
  if (!scheduledSlot || typeof scheduledSlot !== "string" || !scheduledSlot.trim()) {
    return { targetSlot: null, targetDate: null };
  }

  const targetSlot = scheduledSlot.trim();
  if (!isValidSlot(targetSlot)) {
    throw Object.assign(new Error(`Invalid pickup slot: "${scheduledSlot}".`), { status: 400 });
  }

  const [startTime] = targetSlot.split("-");
  const [hours, minutes] = startTime.split(":").map(Number);
  const slotStartMinutes = hours * 60 + minutes;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  if (slotStartMinutes <= currentMinutes + PREP_WINDOW_MINUTES) {
    throw Object.assign(
      new Error(`Slot "${formatSlotLabel(targetSlot)}" is no longer available for pre-order.`),
      { status: 400 }
    );
  }

  return { targetSlot, targetDate: getTodayDateString() };
}

const createPaymentOrder = asyncHandler(async (req, res) => {
  const { items, scheduledSlot, tableNumber } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const { targetSlot, targetDate } = validateSchedule(scheduledSlot);
  if (targetSlot) {
    const booked = await prisma.order.count({
      where: {
        scheduledDate: targetDate,
        scheduledSlot: targetSlot,
        status: { notIn: ["CANCELLED"] },
      },
    });
    if (booked >= MAX_SLOT_CAPACITY) {
      return res.status(409).json({
        error: `Break slot "${formatSlotLabel(targetSlot)}" has reached maximum capacity (${MAX_SLOT_CAPACITY} orders).`,
      });
    }
  }

  const result = await createPendingPaymentOrder({
    userId: req.user.id,
    items,
    targetSlot,
    targetDate,
    tableNumber: typeof tableNumber === "string" ? tableNumber.trim() || null : null,
  });

  res.status(201).json({
    order: {
      id: result.order.id,
      status: result.order.status,
      totalAmount: result.order.totalAmount,
      paymentExpiresAt: result.order.paymentExpiresAt,
    },
    payment: {
      id: result.payment.id,
      razorpayOrderId: result.payment.razorpayOrderId,
      amount: result.payment.amount,
      currency: result.payment.currency,
      keyId: result.razorpayKeyId,
    },
  });
});

const verifyOrderPayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Incomplete Razorpay payment response" });
  }

  const payment = await prisma.payment.findUnique({
    where: { razorpayOrderId: razorpay_order_id },
    include: { order: true },
  });
  if (!payment || payment.orderId !== id) {
    return res.status(404).json({ error: "Payment order not found" });
  }
  if (payment.order.userId !== req.user.id) {
    return res.status(403).json({ error: "Not your order" });
  }
  if (!verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    return res.status(400).json({ error: "Invalid payment signature" });
  }

  const razorpayPayment = await fetchPayment(razorpay_payment_id);
  if (razorpayPayment.order_id !== razorpay_order_id) {
    return res.status(400).json({ error: "Payment does not belong to this order" });
  }
  if (razorpayPayment.currency !== PAYMENT_CURRENCY || razorpayPayment.status !== "captured") {
    return res.status(400).json({ error: "Payment is not captured in the expected currency" });
  }

  const result = await confirmPayment({
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    amount: razorpayPayment.amount,
    currency: razorpayPayment.currency,
    method: razorpayPayment.method,
  });

  if (result.refundRequired) {
    return res.status(409).json({
      error: "Payment arrived after the order expired and requires refund processing",
      refundRequired: true,
    });
  }
  res.json({ success: true, alreadyConfirmed: Boolean(result.alreadyConfirmed), order: result.order });
});

const failOrderPayment = asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.userId !== req.user.id) return res.status(403).json({ error: "Not your order" });
  if (order.status !== "PENDING_PAYMENT") {
    return res.json({ success: true, status: order.status });
  }

  await cancelUnpaidOrder(order.id, "Payment cancelled or failed");
  res.json({ success: true, status: "CANCELLED" });
});

const paymentWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  if (!verifyWebhookSignature(rawBody, signature)) {
    return res.status(400).json({ error: "Invalid webhook signature" });
  }

  const event = JSON.parse(rawBody.toString("utf8"));
  await processWebhookEvent(event);
  res.json({ received: true });
});

module.exports = {
  createPaymentOrder,
  verifyOrderPayment,
  failOrderPayment,
  paymentWebhook,
};
