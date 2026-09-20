const express = require("express");
const {
  createOrder,
  getMyOrders,
  getOrder,
  cancelOrder,
  getDisplayOrders,
  getSlots,
  getCrowdMetrics,
  verifyPickupPin,
} = require("../controllers/order.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Public routes
router.get("/display", getDisplayOrders);
router.get("/slots", getSlots);
router.get("/crowd", getCrowdMetrics);

router.use(requireAuth);
router.post("/", createOrder);
router.get("/mine", getMyOrders);
router.post("/:id/cancel", cancelOrder);
router.post("/:id/verify-pin", verifyPickupPin);
router.get("/:id", getOrder);

module.exports = router;
