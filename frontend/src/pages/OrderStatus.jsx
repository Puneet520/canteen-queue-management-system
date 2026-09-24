import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import client from "../api/client";
import { getSocket } from "../socket";
import { useAuth } from "../context/AuthContext";
import { playDingDongChime } from "../utils/audio";
import StarRating from "../components/StarRating";

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

  // Flip a single item to "reviewed" locally after its rating is submitted.
  function markItemReviewed(menuItemId) {
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((i) =>
              i.menuItemId === menuItemId ? { ...i, reviewed: true } : i
            ),
          }
        : prev
    );
  }

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

  if (error) {
    return (
      <div className="page order-status-page order-status-state-page">
        <div className="order-state-card order-state-error" role="alert">
          <span className="order-state-icon" aria-hidden="true">!</span>
          <span className="order-status-eyebrow">ORDER UNAVAILABLE</span>
          <h1>We couldn&apos;t load this order</h1>
          <p>{error}</p>
          <Link to="/orders" className="btn secondary small">Back to my orders</Link>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="page order-status-page order-status-state-page" aria-busy="true">
        <div className="order-state-card order-state-loading">
          <span className="order-loading-spinner" aria-hidden="true" />
          <span className="order-status-eyebrow">ORDER DETAILS</span>
          <h1>Loading your order</h1>
          <p>We&apos;re getting the latest kitchen update.</p>
        </div>
      </div>
    );
  }

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

  const statusContent = {
    PENDING: {
      eyebrow: "ORDER RECEIVED",
      title: "Order placed",
      description: "Your order is in line and will move to the kitchen shortly.",
    },
    PREPARING: {
      eyebrow: "IN THE KITCHEN",
      title: "Your order is being prepared",
      description: "The kitchen is working on your food now.",
    },
    READY: {
      eyebrow: "READY FOR PICKUP",
      title: "Your order is ready!",
      description: "Show your pickup PIN at the canteen counter.",
    },
    COLLECTED: {
      eyebrow: "ORDER COMPLETE",
      title: "Order collected",
      description: "Enjoy your fresh meal. Thanks for ordering with us.",
    },
    CANCELLED: {
      eyebrow: "ORDER CLOSED",
      title: "Order cancelled",
      description: "This order is no longer active.",
    },
  };

  const currentStatus = statusContent[order.status] || {
    eyebrow: "ORDER STATUS",
    title: order.status,
    description: "We are keeping your order details up to date.",
  };

  return (
    <div className="page order-status-page">
      <header className="order-status-header">
        <Link to="/orders" className="order-back-link">
          <span aria-hidden="true">←</span> My Orders
        </Link>
        <div className="order-header-id">
          <span>Order</span>
          <strong>#{order.token}</strong>
        </div>
      </header>

      <main>
        <section className={`order-status-hero status-${order.status}`} aria-live="polite">
          <div className="order-status-hero-copy">
            <span className="order-status-eyebrow">{currentStatus.eyebrow}</span>
            <h1>{currentStatus.title}</h1>
            <p>{currentStatus.description}</p>
          </div>
          <span className={`order-status-badge badge ${order.status}`}>
            <span className="order-status-badge-dot" aria-hidden="true" />
            {order.status}
          </span>
        </section>

        <section className="order-status-overview" aria-label="Order queue overview">
          <div className="order-token-block">
            <span className="order-section-label">PICKUP TOKEN</span>
            <strong className="order-token">{order.token}</strong>
            <span className="order-token-hint">Keep this handy at the counter</span>
          </div>

          {isActive && (!order.isScheduled || order.isInCookingWindow) && order.queuePosition && (
            <div className="order-metric">
              <span className="order-section-label">QUEUE POSITION</span>
              <strong>#{order.queuePosition}</strong>
              <span>in the live queue</span>
            </div>
          )}

          {isActive && (!order.isScheduled || order.isInCookingWindow) && order.estimatedWaitMinutes !== null && order.estimatedWaitMinutes !== undefined && (
            <div className="order-metric">
              <span className="order-section-label">ESTIMATED WAIT</span>
              <strong>~{order.estimatedWaitMinutes} min</strong>
              <span>based on kitchen pace</span>
            </div>
          )}
        </section>

        <section className="order-progress-panel" aria-labelledby="progress-heading">
          <div className="order-panel-heading">
            <div>
              <span className="order-section-label">LIVE UPDATES</span>
              <h2 id="progress-heading">Your order journey</h2>
            </div>
            <span className="order-progress-caption">Updates automatically</span>
          </div>

          <div className="order-progress" role="list">
            {steps.map((step, index) => {
              const status = getStepStatus(step.key);
              return (
                <div key={step.key} className={`order-progress-step ${status}`} role="listitem">
                  <div className="order-progress-marker">
                    <span aria-hidden="true">{status === "completed" ? "✓" : step.icon}</span>
                  </div>
                  {index < steps.length - 1 && <span className="order-progress-line" aria-hidden="true" />}
                  <span className="order-progress-label">{step.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        {isReady && (
          <section className="order-pickup-card" aria-labelledby="pickup-heading">
            <div className="order-pickup-icon" aria-hidden="true">✓</div>
            <div className="order-pickup-copy">
              <span className="order-status-eyebrow">READY FOR PICKUP</span>
              <h2 id="pickup-heading">Show this PIN at the counter</h2>
              <p>The counter chef will verify it before handing over your order.</p>
            </div>
            <div className="order-pickup-pin" aria-label={`Pickup PIN ${order.pickupPin}`}>
              {order.pickupPin}
            </div>
          </section>
        )}

        {order.isScheduled && !order.isInCookingWindow && order.status === "PENDING" && (
          <section className="order-schedule-card" aria-label="Scheduled pickup">
            <div className="order-schedule-icon" aria-hidden="true">⏰</div>
            <div>
              <span className="order-section-label">SCHEDULED PRE-ORDER</span>
              <h2>Pickup window: {order.scheduledSlotLabel || order.scheduledSlot}</h2>
              <p>The kitchen will begin preparing your meal shortly before this window.</p>
            </div>
          </section>
        )}

        {isCollected && (
          <section className="order-collected-card" aria-live="polite">
            <div className="order-collected-icon" aria-hidden="true">✓</div>
            <div>
              <span className="order-status-eyebrow">ORDER COMPLETE</span>
              <h2>Enjoy your meal!</h2>
              <p>Your order was collected successfully. Thanks for using Canteen Queue.</p>
            </div>
          </section>
        )}

        {isCollected && (
          <RateItemsCard order={order} onItemReviewed={markItemReviewed} />
        )}

        <section className="order-items-card" aria-labelledby="items-heading">
          <div className="order-panel-heading">
            <div>
              <span className="order-section-label">ORDER SUMMARY</span>
              <h2 id="items-heading">What you ordered</h2>
            </div>
            <span className="order-item-count">{order.items.length} {order.items.length === 1 ? "item" : "items"}</span>
          </div>

          <ul className="order-item-list">
            {order.items.map((line, idx) => (
              <li key={idx} className="order-item-row">
                <div className="order-item-info">
                  <strong>{line.name}</strong>
                  <span>{line.station || "Canteen kitchen"}</span>
                </div>
                <span className="order-item-quantity">×{line.quantity}</span>
                <strong className="order-item-price">
                  ₹{(Number(line.unitPrice) * line.quantity).toFixed(2)}
                </strong>
              </li>
            ))}
          </ul>

          <div className="order-summary-total">
            <span>Total amount</span>
            <strong>₹{Number(order.totalAmount).toFixed(2)}</strong>
          </div>

          {order.isScheduled && (
            <div className="order-summary-schedule">
              <span aria-hidden="true">⏰</span>
              <span>Pickup window: <strong>{order.scheduledSlotLabel || order.scheduledSlot}</strong></span>
            </div>
          )}
        </section>

        {order.status === "PENDING" && (
          <div className="order-cancel-area">
            <button onClick={handleCancel} disabled={cancelling} className="btn danger small">
              {cancelling ? "Cancelling..." : "Cancel order"}
            </button>
          </div>
        )}

        <Link to="/orders" className="order-bottom-link">
          <span aria-hidden="true">←</span> Back to my orders
        </Link>
      </main>
    </div>
  );
}

// "Rate your meal" — one interactive star row + optional comment per item the
// user hasn't reviewed yet. Reviews are verified-purchase: the backend only
// accepts them for a COLLECTED order that contained the item.
function RateItemsCard({ order, onItemReviewed }) {
  const [ratings, setRatings] = useState({});
  const [comments, setComments] = useState({});
  const [submitting, setSubmitting] = useState({});
  const [errors, setErrors] = useState({});

  const pending = order.items.filter((i) => !i.reviewed);
  const reviewedCount = order.items.length - pending.length;

  async function submit(item) {
    const rating = ratings[item.menuItemId];
    if (!rating) {
      setErrors((e) => ({ ...e, [item.menuItemId]: "Tap a star to rate" }));
      return;
    }

    setSubmitting((s) => ({ ...s, [item.menuItemId]: true }));
    setErrors((e) => ({ ...e, [item.menuItemId]: "" }));

    try {
      await client.post("/reviews", {
        orderId: order.id,
        menuItemId: item.menuItemId,
        rating,
        comment: comments[item.menuItemId] || "",
      });
      onItemReviewed(item.menuItemId);
    } catch (err) {
      setErrors((e) => ({
        ...e,
        [item.menuItemId]: err.response?.data?.error || "Could not submit rating",
      }));
    } finally {
      setSubmitting((s) => ({ ...s, [item.menuItemId]: false }));
    }
  }

  return (
    <div className="card rate-meal-card" style={{ marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>⭐ Rate your meal</h2>

      {reviewedCount > 0 && pending.length > 0 && (
        <p className="muted" style={{ marginTop: -6 }}>
          Thanks! {reviewedCount} of {order.items.length} rated.
        </p>
      )}

      {pending.length === 0 ? (
        <div className="rate-thanks">
          <span style={{ fontSize: "2rem" }}>🙏</span>
          <p>Thanks for rating — it helps other students choose!</p>
        </div>
      ) : (
        <div className="rate-list">
          {pending.map((item) => (
            <div key={item.menuItemId} className="rate-row">
              <div className="rate-row-head">
                <strong>{item.name}</strong>
                <StarRating
                  value={ratings[item.menuItemId] || 0}
                  onChange={(n) =>
                    setRatings((r) => ({ ...r, [item.menuItemId]: n }))
                  }
                  size={26}
                />
              </div>

              <textarea
                className="input rate-comment"
                placeholder="Add a short comment (optional)"
                rows={2}
                value={comments[item.menuItemId] || ""}
                onChange={(e) =>
                  setComments((c) => ({ ...c, [item.menuItemId]: e.target.value }))
                }
              />

              {errors[item.menuItemId] && (
                <div className="error-text" style={{ marginBottom: 8 }}>
                  {errors[item.menuItemId]}
                </div>
              )}

              <button
                className="btn small"
                onClick={() => submit(item)}
                disabled={submitting[item.menuItemId]}
              >
                {submitting[item.menuItemId] ? "Submitting…" : "Submit rating"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}