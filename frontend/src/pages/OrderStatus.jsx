import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import { getSocket } from "../socket";
import { useAuth } from "../context/AuthContext";
import { playDingDongChime } from "../utils/audio";

export default function OrderStatus() {
  const { id } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    const confirmed = window.confirm("Are you sure you want to cancel this order?");
    if (!confirmed) return;

    setCancelling(true);
    setError("");

    try {
      const { data } = await client.post(`/orders/${id}/cancel`);
      setOrder(data.order);
    } catch (err) {
      setError(err.response?.data?.error || "Could not cancel this order");
    } finally {
      setCancelling(false);
    }
  }

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
      if (updated.id === id) {
        setOrder((prev) => {
          if (prev?.status !== "READY" && updated.status === "READY") {
            playDingDongChime();
            if (typeof navigator !== "undefined" && navigator.vibrate) {
              navigator.vibrate([300, 150, 300]);
            }
          }
          return updated;
        });
      }
    }

    socket.on("order:update", handleUpdate);
    return () => socket.off("order:update", handleUpdate);
  }, [id, user]);

  if (error) return <div className="page error-text">{error}</div>;
  if (!order) return <div className="page">Loading order details...</div>;

  const isActive = order.status === "PENDING" || order.status === "PREPARING";
  const isReady = order.status === "READY";
  const isCollected = order.status === "COLLECTED";

  // Step index
  const steps = [
    { key: "PENDING", label: "Order Placed", icon: "📝" },
    { key: "PREPARING", label: "In Kitchen", icon: "🍳" },
    { key: "READY", label: "Ready for Pickup", icon: "🔔" },
    { key: "COLLECTED", label: "Collected", icon: "✓" },
  ];

  function getStepStatus(stepKey) {
    if (order.status === "CANCELLED") return "cancelled";
    const orderIndex = steps.findIndex((s) => s.key === order.status);
    const thisIndex = steps.findIndex((s) => s.key === stepKey);
    if (thisIndex < orderIndex) return "completed";
    if (thisIndex === orderIndex) return "active";
    return "upcoming";
  }

  return (
    <div className="page" style={{ maxWidth: 680 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <span className="muted" style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "1px" }}>
            Order Token
          </span>
          <h1 style={{ margin: "2px 0 0", fontSize: "2.4rem" }}>{order.token}</h1>
        </div>
        <span className={`badge ${order.status}`} style={{ fontSize: "0.9rem", padding: "6px 14px" }}>
          {order.status}
        </span>
      </div>

      {/* Progress Stepper */}
      <div className="stepper-container">
        {steps.map((step) => {
          const status = getStepStatus(step.key);
          return (
            <div key={step.key} className={`stepper-step ${status}`}>
              <div className="stepper-circle">{step.icon}</div>
              <div className="stepper-label">{step.label}</div>
            </div>
          );
        })}
      </div>

      {/* READY FOR PICKUP PIN BANNER (Prominent) */}
      {isReady && (
        <div className="pickup-pin-hero">
          <div className="pickup-pin-eyebrow">🎉 ORDER IS READY AT COUNTER 1</div>
          <div className="pickup-pin-label">Show this 4-Digit PIN to collect your food:</div>
          <div className="pickup-pin-code">{order.pickupPin}</div>
          <p className="pickup-pin-sub">The counter chef will verify your PIN before handing over the tray.</p>
        </div>
      )}

      {/* Active Queue Position Banner */}
      {isActive && order.queuePosition && (
        <div className="queue-banner" style={{ marginTop: 20 }}>
          <div className="muted">Your position in the live queue</div>
          <div className="position">#{order.queuePosition}</div>
          <div className="muted" style={{ fontWeight: 600, marginTop: 4 }}>
            Estimated wait time: ~{order.estimatedWaitMinutes} min
          </div>
          <div style={{ fontSize: "0.85rem", color: "#6b6a64", marginTop: 8 }}>
            (Calculated using real-time item cooking times & queue speed)
          </div>
        </div>
      )}

      {/* Cancel button if pending */}
      {order.status === "PENDING" && (
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="btn danger small"
          >
            {cancelling ? "Cancelling..." : "Cancel Order"}
          </button>
        </div>
      )}

      {/* Collected confirmation */}
      {isCollected && (
        <div className="card" style={{ background: "#e8f5e9", borderColor: "#a5d6a7", textAlign: "center", padding: "24px" }}>
          <span style={{ fontSize: "2.4rem" }}>🎉</span>
          <h2 style={{ color: "#2e7d32", margin: "8px 0 4px" }}>Order Collected</h2>
          <p className="muted" style={{ margin: 0 }}>Enjoy your fresh meal! Thank you for using Canteen Queue.</p>
        </div>
      )}

      {/* Order Items Summary */}
      <div className="card" style={{ marginTop: 20 }}>
        <h2>Order Items</h2>
        <table>
          <thead>
            <tr>
              <th>Dish</th>
              <th style={{ textAlign: "center" }}>Qty</th>
              <th style={{ textAlign: "right" }}>Price</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((line, idx) => (
              <tr key={idx}>
                <td>
                  <strong>{line.name}</strong>
                  {line.station && <span className="muted" style={{ fontSize: "0.8rem", marginLeft: 8 }}>({line.station})</span>}
                </td>
                <td style={{ textAlign: "center" }}>x{line.quantity}</td>
                <td style={{ textAlign: "right" }}>
                  ₹{(Number(line.unitPrice) * line.quantity).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 12, borderTop: "2px dashed var(--border)" }}>
          <span style={{ fontSize: "1.1rem" }}>Total Amount (Pay at Counter):</span>
          <strong style={{ fontSize: "1.3rem", color: "var(--navy)" }}>
            ₹{Number(order.totalAmount).toFixed(2)}
          </strong>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <Link to="/orders" className="muted">
          ← Back to my orders
        </Link>
      </div>
    </div>
  );
}