const bcrypt = require("bcryptjs");
const prisma = require("../config/db");
const { signToken } = require("../utils/token");
const { asyncHandler } = require("../middleware/errorHandler");

// POST /api/auth/register
// Students/faculty self-register. Admin accounts are seeded separately
// (see prisma/seed.js) rather than created through this public endpoint.
const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email and password are required" });
  }

  const allowedSelfSignupRoles = ["STUDENT", "FACULTY"];
  const finalRole = allowedSelfSignupRoles.includes(role) ? role : "STUDENT";

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { name, email: email.toLowerCase().trim(), passwordHash, role: finalRole },
    select: { id: true, name: true, email: true, role: true },
  });

  const token = signToken(user);
  res.status(201).json({ user, token });
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid email or password" });

  const token = signToken(user);
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    token,
  });
});

// GET /api/auth/me — used by the frontend to restore a session on refresh
const me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

module.exports = { register, login, me };
