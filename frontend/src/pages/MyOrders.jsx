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
                ...updatedOrder,
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

      <div className="order-receipt-list">
        {orders.map((o) => {
          const itemsSummary = (o.items || [])
            .map((i) => `${i.name} ×${i.quantity}`)
            .join(", ");

          return (
            <Link
              key={o.id}
              to={`/orders/${o.id}`}
              className="order-receipt-link"
            >
              <article className="card order-receipt">
                <div className="order-receipt-top">
                  <div>
                    <div className="order-receipt-token">{o.token}</div>
                    <div className="muted">
                      {new Date(o.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <span className={`badge ${o.status}`}>{o.status}</span>
                </div>

                <p className="order-receipt-items">{itemsSummary || "Order items"}</p>

                <div className="order-receipt-meta">
                  <span>₹{Number(o.totalAmount).toFixed(2)}</span>
                  {o.scheduledSlotLabel && (
                    <span className="order-slot-tag">⏰ {o.scheduledSlotLabel}</span>
                  )}
                  {o.tableNumber && <span className="table-dinein-pill">Table #{o.tableNumber}</span>}
                </div>

                {o.status === "COLLECTED" && (
                  <div className="rate-nudge">★ Rate your meal →</div>
                )}
              </article>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
