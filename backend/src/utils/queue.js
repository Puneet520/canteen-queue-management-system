// Queue helpers — FR-9/FR-10: FIFO position + rough wait-time estimate.
// Kept intentionally simple for the MVP: position among orders that are
// not yet Ready/Collected/Cancelled, ordered by creation time.

const ACTIVE_STATUSES = ["PENDING", "PREPARING"];

// Average time to prepare one order, used only for the ETA estimate shown to the user.
const AVG_PREP_MINUTES = 4;

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

function estimateWaitMinutes(position) {
  if (position == null) return 0;
  return Math.max(0, (position - 1) * AVG_PREP_MINUTES);
}

function generateToken(sequenceHint) {
  // Simple human-readable pickup token: letter block + zero-padded number.
  const letter = String.fromCharCode(65 + (sequenceHint % 26));
  const num = (sequenceHint % 900) + 100;
  return `${letter}-${num}`;
}

module.exports = { getQueuePosition, estimateWaitMinutes, generateToken, ACTIVE_STATUSES };
