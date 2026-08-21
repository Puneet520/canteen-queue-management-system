const express = require("express");
const { listOrders, updateOrderStatus, getDailySummary } = require("../controllers/admin.controller");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth, requireRole("ADMIN"));
router.get("/orders", listOrders);
router.patch("/orders/:id/status", updateOrderStatus);
router.get("/summary", getDailySummary);

module.exports = router;
