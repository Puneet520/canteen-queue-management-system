// Queue helpers: dynamic multi-factor ETA, FIFO position, and pickup PIN generator

const ACTIVE_STATUSES = ["PENDING", "PREPARING"];

// Kitchen concurrency factor: assumes ~2-3 concurrent cooking tracks in typical campus kitchen
const CONCURRENT_COOKING_TRACKS = 2;

async function getQueuePosition(prisma, order) {
  if (!ACTIVE_STATUSES.includes(order.status)) return null;

  const aheadCount = await prisma.order.count({
    where: {
      status: { in: ACTIVE_STATUSES },
      createdAt: { lt: order.createdAt },
    },
  });

  return aheadCount + 1; // 1-indexed position
}

/**
 * Dynamic Smart ETA calculation
 * @param {number|null} position - 1-indexed queue position
 * @param {Array} orderItems - array of items in current order
 * @param {string} status - current order status
 */
function estimateWaitMinutes(position, orderItems = [], status = "PENDING") {
  if (status === "READY" || status === "COLLECTED" || status === "CANCELLED") {
    return 0;
  }
  if (position == null) return 0;

  // Calculate base preparation time for this order (parallel execution of different items)
  let maxItemPrep = 3;
  let totalItemMinutes = 0;

  if (Array.isArray(orderItems) && orderItems.length > 0) {
    for (const line of orderItems) {
      const itemPrep = line.menuItem?.prepTimeMinutes || line.prepTimeMinutes || 3;
      const qty = line.quantity || 1;
      maxItemPrep = Math.max(maxItemPrep, itemPrep);
      totalItemMinutes += itemPrep * Math.min(qty, 3); // diminishing extra time for duplicate items (batched)
    }
  }

  // Blended prep time for current order
  const currentOrderPrep = Math.max(maxItemPrep, Math.ceil(totalItemMinutes / 1.5));

  if (status === "PREPARING") {
    // Already on stove/counter, almost done
    return Math.max(1, Math.ceil(currentOrderPrep * 0.5));
  }

  // Ahead waiting time scaled by kitchen concurrency
  const ordersAhead = Math.max(0, position - 1);
  const queueDelay = Math.ceil((ordersAhead * 3) / CONCURRENT_COOKING_TRACKS);

  return Math.max(2, currentOrderPrep + queueDelay);
}

function generateToken(sequenceHint) {
  // Simple human-readable pickup token: letter block + zero-padded number.
  const letter = String.fromCharCode(65 + (sequenceHint % 26));
  const num = (sequenceHint % 900) + 100;
  return `${letter}-${num}`;
}

function generatePickupPin() {
  // 4-digit PIN for verification at the pickup counter
  return Math.floor(1000 + Math.random() * 9000).toString();
}

const { isOrderInCookingWindow, getTodayDateString } = require("./slots");

async function getCrowdStatus(prisma) {
  const todayStr = getTodayDateString();
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

  // Active cooking orders: PENDING or PREPARING
  const activeOrders = await prisma.order.findMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      OR: [
        { scheduledDate: null },
        { scheduledDate: todayStr },
      ],
    },
    include: {
      items: { include: { menuItem: true } },
    },
  });

  // Filter to orders currently in their cooking window
  const activeInWindow = activeOrders.filter((o) =>
    isOrderInCookingWindow(o.scheduledSlot, o.scheduledDate)
  );

  const activeCount = activeInWindow.length;

  // Ready orders waiting for pickup at the counter
  const readyCount = await prisma.order.count({
    where: {
      status: "READY",
      OR: [
        { scheduledDate: null },
        { scheduledDate: todayStr },
      ],
    },
  });

  // Orders placed in the last 15 minutes (rush velocity)
  const recentOrders15m = await prisma.order.count({
    where: {
      createdAt: { gte: fifteenMinutesAgo },
      status: { notIn: ["CANCELLED"] },
    },
  });

  // Estimated wait time for a new order arriving right now
  const simulatedPosition = activeCount + 1;
  const estWaitMinutes = estimateWaitMinutes(simulatedPosition, [], "PENDING");

  let level = "LOW";
  let label = "Low Wait";
  let color = "#10b981"; // emerald
  let advice = "Kitchen running fast — great time to order!";

  if (activeCount >= 10 || (activeCount >= 6 && recentOrders15m >= 8)) {
    level = "PEAK";
    label = "Peak Rush";
    color = "#ef4444";
    advice = "High rush at counter! Consider pre-ordering for an upcoming break slot.";
  } else if (activeCount >= 4 || recentOrders15m >= 4) {
    level = "MODERATE";
    label = "Moderate Rush";
    color = "#f59e0b";
    advice = "Steady queue. Preparation takes around 8–12 mins.";
  }

  const displayWait =
    level === "PEAK"
      ? Math.max(estWaitMinutes, 22)
      : level === "MODERATE"
        ? Math.max(estWaitMinutes, 10)
        : Math.max(estWaitMinutes, 4);

  return {
    level,
    label,
    color,
    advice,
    activeCount,
    readyCount,
    recentOrders15m,
    estWaitMinutes: displayWait,
  };
}

module.exports = {
  getQueuePosition,
  estimateWaitMinutes,
  generateToken,
  generatePickupPin,
  getCrowdStatus,
  ACTIVE_STATUSES,
};
