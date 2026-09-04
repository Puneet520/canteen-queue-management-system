const express = require("express");
const {
  createOrder,
  getMyOrders,
  getOrder,
  cancelOrder,
  getDisplayOrders,
  verifyPickupPin,
} = require("../controllers/order.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Public route for wall-mounted TV display screen in canteen
router.get("/display", getDisplayOrders);

router.use(requireAuth);
router.post("/", createOrder);
router.get("/mine", getMyOrders);
router.post("/:id/cancel", cancelOrder);
router.post("/:id/verify-pin", verifyPickupPin);
router.get("/:id", getOrder);

module.exports = router;
