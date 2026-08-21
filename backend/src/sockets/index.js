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
    // Client tells us who they are right after connecting so we can
    // put them in the right room. In a production build this would be
    // verified against the JWT instead of trusted blindly.
    socket.on("identify", ({ userId, role }) => {
      if (userId) socket.join(`user:${userId}`);
      if (role === "ADMIN") socket.join("admins");
    });

    socket.on("disconnect", () => {
      // no-op for MVP — rooms are cleaned up automatically by socket.io
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error("Socket.IO not initialized yet");
  return io;
}

// Emit to the specific user who owns this order (order status changed).
function emitOrderUpdate(userId, order) {
  getIO().to(`user:${userId}`).emit("order:update", order);
}

// Emit to every connected admin dashboard (new order placed / list changed).
function emitAdminOrdersChanged(payload) {
  getIO().to("admins").emit("admin:orders-changed", payload);
}

module.exports = { initSockets, getIO, emitOrderUpdate, emitAdminOrdersChanged };
