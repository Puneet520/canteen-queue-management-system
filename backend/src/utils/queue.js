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

module.exports = {
  getQueuePosition,
  estimateWaitMinutes,
  generateToken,
  generatePickupPin,
  ACTIVE_STATUSES,
};
