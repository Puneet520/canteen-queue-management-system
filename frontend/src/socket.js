import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

let socket = null;
let currentUser = null;

function identifySocket() {
  if (!socket || !socket.connected || !currentUser) return;

  socket.emit("identify", {
    userId: currentUser.id,
    role: currentUser.role,
  });
}

export function getSocket(user = null) {
  if (user) {
    currentUser = user;
  }

  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: true,
    });

    socket.on("connect", identifySocket);
  }

  if (currentUser) {
    identifySocket();
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.off("connect", identifySocket);
    socket.disconnect();
    socket = null;
  }

  currentUser = null;
}