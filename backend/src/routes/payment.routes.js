const express = require("express");
const { paymentWebhook } = require("../controllers/payment.controller");

const router = express.Router();

router.post("/webhook", express.raw({ type: "application/json" }), paymentWebhook);

module.exports = router;
