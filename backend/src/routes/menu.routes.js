const express = require("express");
const {
  listMenu,
  listMenuAdmin,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
} = require("../controllers/menu.controller");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Public — students/faculty browse the live menu
router.get("/", listMenu);

// Admin-only management
router.get("/all", requireAuth, requireRole("ADMIN"), listMenuAdmin);
router.post("/", requireAuth, requireRole("ADMIN"), createMenuItem);
router.put("/:id", requireAuth, requireRole("ADMIN"), updateMenuItem);
router.delete("/:id", requireAuth, requireRole("ADMIN"), deleteMenuItem);

module.exports = router;
