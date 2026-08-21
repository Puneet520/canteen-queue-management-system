import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import { getSocket } from "../socket";
import { useAuth } from "../context/AuthContext";

export default function OrderStatus() {
  const { id } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    client
      .get(`/orders/${id}`)
      .then(({ data }) => setOrder(data.order))
      .catch(() => setError("Could not load this order"));
  }, [id]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket(user);

    function handleUpdate(updated) {
      if (updated.id === id) setOrder(updated);
    }
    socket.on("order:update", handleUpdate);
    return () => socket.off("order:update", handleUpdate);
  }, [id, user]);

  if (error) return <div className="page error-text">{error}</div>;
  if (!order) return <div className="page">Loading order...</div>;

  const isActive = order.status === "PENDING" || order.status === "PREPARING";

  return (
    <div className="page">
      <h1>Order {order.token}</h1>
      <span className={`badge ${order.status}`}>{order.status}</span>

      {isActive && order.queuePosition && (
        <div className="queue-banner" style={{ marginTop: 16 }}>
          <div className="muted">Your position in the queue</div>
          <div className="position">#{order.queuePosition}</div>
          <div className="muted">Estimated wait: ~{order.estimatedWaitMinutes} min</div>
        </div>
      )}

      {order.status === "READY" && (
        <div className="queue-banner" style={{ background: "#dcefc4", borderColor: "#97c459" }}>
          <strong>Your order is ready — head to the counter!</strong>
        </div>
      )}

      {order.status === "COLLECTED" && (
        <div className="card">Order collected. Thanks for using Canteen Queue!</div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Items</h2>
        <table>
          <tbody>
            {order.items.map((line, idx) => (
              <tr key={idx}>
                <td>{line.name}</td>
                <td>x{line.quantity}</td>
                <td>₹{(Number(line.unitPrice) * line.quantity).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 10 }}><strong>Total: ₹{Number(order.totalAmount).toFixed(2)}</strong></p>
      </div>

      <Link to="/orders" className="muted">← Back to my orders</Link>
    </div>
  );
}
