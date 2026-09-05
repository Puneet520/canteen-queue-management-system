import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";
import { getSocket } from "../socket";
import { useAuth } from "../context/AuthContext";

export default function MyOrders() {
  const { user } = useAuth();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadOrders() {
    try {
      const { data } = await client.get("/orders/mine");
      setOrders(data.orders);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;

    loadOrders();

    const socket = getSocket(user);

    function handleOrderUpdate(updatedOrder) {
      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === updatedOrder.id
            ? {
                ...order,
                status: updatedOrder.status,
                queuePosition: updatedOrder.queuePosition,
                estimatedWaitMinutes:
                  updatedOrder.estimatedWaitMinutes,
                updatedAt: updatedOrder.updatedAt,
              }
            : order
        )
      );
    }

    socket.on("order:update", handleOrderUpdate);

    return () => {
      socket.off("order:update", handleOrderUpdate);
    };
  }, [user]);

  if (loading) return <div className="page">Loading...</div>;

  return (
    <div className="page">
      <h1>My Orders</h1>

      {orders.length === 0 && (
        <p className="muted">
          No orders yet — go grab something from the menu!
        </p>
      )}

      {orders.map((o) => (
        <Link
          key={o.id}
          to={`/orders/${o.id}`}
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div
            className="card"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <strong>{o.token}</strong>
              <div className="muted">
                {new Date(o.createdAt).toLocaleString()}
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <span className={`badge ${o.status}`}>
                {o.status}
              </span>
              {o.status === "COLLECTED" && (
                <div className="rate-nudge">★ Rate your meal →</div>
              )}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}