const prisma = require("../config/db");
const { asyncHandler } = require("../middleware/errorHandler");
const { emitMenuStockChanged } = require("../sockets");

// Recomputes and persists a menu item's denormalized rating aggregates.
// Keeps avgRating/ratingCount on MenuItem so cards render stars without an
// N+1 query, and returns the fresh numbers for the response.
async function refreshItemRating(tx, menuItemId) {
  const agg = await tx.review.aggregate({
    where: { menuItemId },
    _avg: { rating: true },
    _count: { rating: true },
  });

  const avgRating = agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : 0;
  const ratingCount = agg._count.rating || 0;

  await tx.menuItem.update({
    where: { id: menuItemId },
    data: { avgRating, ratingCount },
  });

  return { avgRating, ratingCount };
}

// POST /api/reviews — a verified-purchase rating.
// A user may rate a menu item only if they have a COLLECTED order that
// contained it, and only once per (item, order).
const createReview = asyncHandler(async (req, res) => {
  const { orderId, menuItemId, rating, comment } = req.body;

  const numericRating = Number(rating);
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    return res.status(400).json({ error: "Rating must be a whole number from 1 to 5" });
  }
  if (!orderId || !menuItemId) {
    return res.status(400).json({ error: "orderId and menuItemId are required" });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }
  if (order.userId !== req.user.id) {
    return res.status(403).json({ error: "You can only review your own orders" });
  }
  if (order.status !== "COLLECTED") {
    return res.status(400).json({ error: "You can review items only after the order is collected" });
  }
  if (!order.items.some((i) => i.menuItemId === menuItemId)) {
    return res.status(400).json({ error: "This item was not part of that order" });
  }

  const existing = await prisma.review.findUnique({
    where: {
      userId_menuItemId_orderId: {
        userId: req.user.id,
        menuItemId,
        orderId,
      },
    },
  });
  if (existing) {
    return res.status(409).json({ error: "You have already reviewed this item for this order" });
  }

  const trimmedComment = typeof comment === "string" ? comment.trim().slice(0, 500) : null;

  const { review, aggregate } = await prisma.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: {
        userId: req.user.id,
        menuItemId,
        orderId,
        rating: numericRating,
        comment: trimmedComment || null,
      },
    });

    const aggregate = await refreshItemRating(tx, menuItemId);
    return { review, aggregate };
  });

  // Broadcast the refreshed menu so every open card updates its stars live.
  const updatedMenuItems = await prisma.menuItem.findMany({ orderBy: { name: "asc" } });
  emitMenuStockChanged(updatedMenuItems);

  res.status(201).json({ review, ...aggregate });
});

// GET /api/menu/:id/reviews — public list of recent reviews for one item,
// used by the item-detail modal.
const listItemReviews = asyncHandler(async (req, res) => {
  const reviews = await prisma.review.findMany({
    where: { menuItemId: req.params.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { user: { select: { name: true } } },
  });

  const item = await prisma.menuItem.findUnique({
    where: { id: req.params.id },
    select: { avgRating: true, ratingCount: true },
  });

  res.json({
    avgRating: item?.avgRating ?? 0,
    ratingCount: item?.ratingCount ?? 0,
    reviews: reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      // First name only — keep reviewers lightly anonymised on a public list.
      reviewer: (r.user?.name || "Student").split(" ")[0],
    })),
  });
});

module.exports = { createReview, listItemReviews };
