const express = require("express");
const {
  createOrder,
  getMyOrders,
  getOrder,
  cancelOrder,
} = require("../controllers/order.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);
router.post("/", createOrder);
router.get("/mine", getMyOrders);
router.post("/:id/cancel", cancelOrder);
router.get("/:id", getOrder);

module.exports = router;
