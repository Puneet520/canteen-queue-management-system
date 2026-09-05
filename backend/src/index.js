require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");

const { errorHandler } = require("./middleware/errorHandler");
const { initSockets } = require("./sockets");

const authRoutes = require("./routes/auth.routes");
const menuRoutes = require("./routes/menu.routes");
const orderRoutes = require("./routes/order.routes");
const adminRoutes = require("./routes/admin.routes");
const reviewRoutes = require("./routes/review.routes");

const app = express();
const server = http.createServer(app);

const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/reviews", reviewRoutes);

app.use((req, res) => res.status(404).json({ error: "Route not found" }));
app.use(errorHandler);

initSockets(server, clientOrigin);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Canteen backend listening on http://localhost:${PORT}`);
});

module.exports = { app, server };
