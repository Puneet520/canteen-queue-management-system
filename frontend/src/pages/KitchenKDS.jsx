import { useEffect, useState, useMemo } from "react";
import client from "../api/client";
import { getSocket } from "../socket";
import { useAuth } from "../context/AuthContext";
import { playKitchenNewOrderTone } from "../utils/audio";

export default function KitchenKDS() {
  const { user } = useAuth();
  const [data, setData] = useState({ orders: [], batchSummary: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedStation, setSelectedStation] = useState("All");
  const [checkedItems, setCheckedItems] = useState({}); // { `${orderId}-${itemId}`: boolean }
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [pinModal, setPinModal] = useState(null); // order object when verifying PIN
  const [inputPin, setInputPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  function loadKitchen() {
    client
      .get("/admin/kitchen")
      .then(({ data }) => {
        setData(data);
        setError("");
      })
      .catch((err) => setError(err.response?.data?.error || "Could not load kitchen queue"))
      .finally(() => setLoading(false));
  }

  // Timer tick for order aging
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadKitchen();

    const socket = getSocket(user);
    socket.emit("join:kitchen");

    function handleChange(payload) {
      loadKitchen();
      if (payload?.type === "created" && audioEnabled) {
        playKitchenNewOrderTone();
      }
    }

    socket.on("admin:orders-changed", handleChange);
    socket.on("kitchen:orders-changed", handleChange);

    return () => {
      socket.off("admin:orders-changed", handleChange);
      socket.off("kitchen:orders-changed", handleChange);
    };
  }, [user, audioEnabled]);

  async function updateStatus(orderId, nextStatus) {
    try {
      await client.patch(`/admin/orders/${orderId}/status`, { status: nextStatus });
      loadKitchen();
    } catch (err) {
      setError(err.response?.data?.error || "Could not update status");
    }
  }

  async function handleVerifyPin(e) {
    e.preventDefault();
    if (!pinModal) return;

    setPinError("");
    try {
      await client.post(`/orders/${pinModal.id}/verify-pin`, { pin: inputPin });
      setPinModal(null);
      setInputPin("");
      loadKitchen();
    } catch (err) {
      setPinError(err.response?.data?.error || "Invalid PIN");
    }
  }

  function toggleItemChecked(orderId, itemId) {
    const key = `${orderId}-${itemId}`;
    setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Stations
  const stations = useMemo(() => {
    const set = new Set(["All"]);
    for (const o of data.orders) {
      for (const i of o.items) {
        if (i.station) set.add(i.station);
      }
    }
    return Array.from(set);
  }, [data.orders]);

  // Filter orders by station
  const filteredOrders = useMemo(() => {
    if (selectedStation === "All") return data.orders;
    return data.orders.filter((o) =>
      o.items.some((i) => i.station === selectedStation)
    );
  }, [data.orders, selectedStation]);

  function formatElapsed(createdTime) {
    const seconds = Math.max(0, Math.floor((now - new Date(createdTime).getTime()) / 1000));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  }

  function getTimerClass(createdTime) {
    const mins = Math.floor((now - new Date(createdTime).getTime()) / 60000);
    if (mins >= 8) return "kds-timer-critical"; // Red
    if (mins >= 4) return "kds-timer-warning";  // Yellow/Orange
    return "kds-timer-normal";                  // Green
  }

  if (loading) return <div className="page">Loading Kitchen Display System...</div>;

  return (
    <div className="kds-page">
      {/* KDS Header */}
      <header className="kds-header">
        <div className="kds-brand">
          <span className="kds-badge-title">KDS</span>
          <div>
            <h1>Kitchen Display System</h1>
            <p className="muted">Live order tickets & batch cooking optimization</p>
          </div>
        </div>

        <div className="kds-header-metrics">
          <div className="kds-metric-pill">
            <span className="kds-dot pending" />
            <span>Pending: <strong>{data.counts?.pending || 0}</strong></span>
          </div>
          <div className="kds-metric-pill">
            <span className="kds-dot preparing" />
            <span>Cooking: <strong>{data.counts?.preparing || 0}</strong></span>
          </div>
          <div className="kds-metric-pill">
            <span className="kds-dot ready" />
            <span>Ready: <strong>{data.counts?.ready || 0}</strong></span>
          </div>
          <button
            className={`btn small ${audioEnabled ? "secondary" : ""}`}
            onClick={() => setAudioEnabled(!audioEnabled)}
          >
            {audioEnabled ? "🔊 Sound Alert ON" : "🔇 Sound Alert OFF"}
          </button>
        </div>
      </header>

      {error && <div className="error-text">{error}</div>}

      {/* Batch Cooking Helper Bar */}
      {data.batchSummary?.length > 0 && (
        <section className="kds-batch-bar">
          <div className="kds-batch-title">
            <span>🔥</span>
            <strong>ACTIVE BATCH DEMAND:</strong>
          </div>
          <div className="kds-batch-chips">
            {data.batchSummary.map((b) => (
              <div key={b.name} className="kds-batch-chip">
                <span className="kds-batch-count">{b.count}x</span>
                <span className="kds-batch-name">{b.name}</span>
                <span className="kds-batch-station">{b.station}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Station Filters */}
      <div className="kds-station-tabs">
        {stations.map((st) => (
          <button
            key={st}
            className={`kds-tab-btn ${selectedStation === st ? "active" : ""}`}
            onClick={() => setSelectedStation(st)}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Orders Grid */}
      <main className="kds-grid">
        {filteredOrders.length === 0 ? (
          <div className="kds-empty">
            <span>👨‍🍳</span>
            <h2>No active kitchen orders</h2>
            <p>All tickets have been fulfilled and handed over.</p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const timerClass = getTimerClass(order.createdAt);
            const isReady = order.status === "READY";
            const isPreparing = order.status === "PREPARING";

            return (
              <div key={order.id} className={`kds-card ${isReady ? "kds-card-ready" : ""}`}>
                {/* Card Top */}
                <div className="kds-card-header">
                  <div>
                    <div className="kds-card-token">{order.token}</div>
                    <div className="kds-card-cust">Customer: {order.customer?.name || "Student"}</div>
                  </div>
                  <div className={`kds-timer ${timerClass}`}>
                    ⏱️ {formatElapsed(order.createdAt)}
                  </div>
                </div>

                {/* Items List with Interactive Checkbox */}
                <div className="kds-items-list">
                  {order.items.map((item, idx) => {
                    const checkedKey = `${order.id}-${item.id || idx}`;
                    const isChecked = !!checkedItems[checkedKey];

                    return (
                      <div
                        key={idx}
                        className={`kds-item-row ${isChecked ? "checked" : ""}`}
                        onClick={() => toggleItemChecked(order.id, item.id || idx)}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="kds-item-checkbox"
                        />
                        <span className="kds-item-qty">{item.quantity}x</span>
                        <span className="kds-item-name">{item.name}</span>
                        <span className="kds-item-station">{item.station}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Order Footer & Action Buttons */}
                <div className="kds-card-footer">
                  <div className="kds-pin-preview">
                    PIN: <strong>{order.pickupPin || "----"}</strong>
                  </div>

                  <div className="kds-actions">
                    {order.status === "PENDING" && (
                      <button
                        className="btn kds-action-btn primary"
                        onClick={() => updateStatus(order.id, "PREPARING")}
                      >
                        ▶ Start Cooking
                      </button>
                    )}

                    {isPreparing && (
                      <button
                        className="btn kds-action-btn ready"
                        onClick={() => updateStatus(order.id, "READY")}
                      >
                        ✓ Mark Ready
                      </button>
                    )}

                    {isReady && (
                      <button
                        className="btn kds-action-btn complete"
                        onClick={() => {
                          setPinModal(order);
                          setInputPin(order.pickupPin); // prefill for easy 1-click counter staff verification
                        }}
                      >
                        🤝 Handover / Collect
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </main>

      {/* Handover PIN Modal */}
      {pinModal && (
        <div className="modal-backdrop" onClick={() => setPinModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Verify Order Handover</h3>
            <p className="muted">
              Order <strong>{pinModal.token}</strong> for {pinModal.customer?.name}
            </p>

            {pinError && <div className="error-text">{pinError}</div>}

            <form onSubmit={handleVerifyPin}>
              <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                Enter 4-Digit Student PIN:
              </label>
              <input
                type="text"
                maxLength={4}
                autoFocus
                className="input"
                style={{ fontSize: "1.8rem", textAlign: "center", letterSpacing: "8px" }}
                value={inputPin}
                onChange={(e) => setInputPin(e.target.value)}
                placeholder="0000"
              />

              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button type="submit" className="btn" style={{ flex: 1 }}>
                  Confirm Pickup
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setPinModal(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
