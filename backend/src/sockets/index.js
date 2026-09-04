// Real-time layer (FR-10, FR-16): pushes order status changes and queue
// position updates instantly to the user who placed the order, and pushes
// new/updated orders to any connected admin dashboards.
//
// Rooms used:
//   user:<userId>   -> that student/faculty member's own devices
//   admins           -> every connected admin dashboard

let io;

function initSockets(server, corsOrigin) {
  const { Server } = require("socket.io");

  io = new Server(server, {
    cors: { origin: corsOrigin, credentials: true },
  });

  io.on("connection", (socket) => {
    socket.on("identify", ({ userId, role }) => {
      if (userId) socket.join(`user:${userId}`);
      if (role === "ADMIN") socket.join("admins");
    });

    // Public TV display screen
    socket.on("join:display", () => {
      socket.join("display");
    });

    // Kitchen KDS screen
    socket.on("join:kitchen", () => {
      socket.join("kitchen");
      socket.join("admins");
    });

    socket.on("disconnect", () => {
      // rooms cleaned up automatically
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error("Socket.IO not initialized yet");
  return io;
}

// Emit to the specific user who owns this order
function emitOrderUpdate(userId, order) {
  getIO().to(`user:${userId}`).emit("order:update", order);
}

// Emit to every connected admin dashboard
function emitAdminOrdersChanged(payload) {
  getIO().to("admins").emit("admin:orders-changed", payload);
  getIO().to("kitchen").emit("kitchen:orders-changed", payload);
}

// Emit to connected public canteen display screens
function emitDisplayOrdersChanged(payload) {
  getIO().to("display").emit("display:orders-changed", payload);
}

// Emit menu stock changes to all connected clients
function emitMenuStockChanged(items) {
  getIO().emit("menu:stock-changed", items);
}

module.exports = {
  initSockets,
  getIO,
  emitOrderUpdate,
  emitAdminOrdersChanged,
  emitDisplayOrdersChanged,
  emitMenuStockChanged,
};
