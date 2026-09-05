const express = require("express");
const { createReview } = require("../controllers/review.controller");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Submitting a review requires being logged in; ownership + collected-order
// checks are enforced in the controller.
router.post("/", requireAuth, createReview);

module.exports = router;
