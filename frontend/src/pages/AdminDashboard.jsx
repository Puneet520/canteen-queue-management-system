import { useEffect, useState } from "react";
import client from "../api/client";
import { getSocket } from "../socket";
import { useAuth } from "../context/AuthContext";

const ACTIVE = ["PENDING", "PREPARING", "READY"];

export default function AdminDashboard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [tab, setTab] = useState("orders"); // orders | menu
  const [menuItems, setMenuItems] = useState([]);
  const [newItem, setNewItem] = useState({ name: "", price: "", category: "General", stockQty: "" });
  const [error, setError] = useState("");
  const [restockAmounts, setRestockAmounts] = useState({});

  function loadOrders() {
    client.get("/admin/orders").then(({ data }) => setOrders(data.orders));
  }
  function loadSummary() {
    client.get("/admin/summary").then(({ data }) => setSummary(data));
  }
  function loadMenu() {
    client.get("/menu/all").then(({ data }) => setMenuItems(data.items));
  }

  useEffect(() => {
    loadOrders();
    loadSummary();
    loadMenu();
  }, []);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket(user);
    function handleChange() {
      loadOrders();
      loadSummary();
      loadMenu();
    }
    socket.on("admin:orders-changed", handleChange);
    return () => socket.off("admin:orders-changed", handleChange);
  }, [user]);

  async function advanceStatus(orderId) {
    try {
      await client.patch(`/admin/orders/${orderId}/status`, {});
      loadOrders();
    } catch (err) {
      setError(err.response?.data?.error || "Could not update order");
    }
  }

  async function addMenuItem(e) {
    e.preventDefault();
    setError("");
    try {
      await client.post("/menu", {
        ...newItem,
        price: Number(newItem.price),
        stockQty: Number(newItem.stockQty),
      });
      setNewItem({ name: "", price: "", category: "General", stockQty: "" });
      loadMenu();
    } catch (err) {
      setError(err.response?.data?.error || "Could not add item");
    }
  }

  async function toggleAvailability(item) {
    await client.put(`/menu/${item.id}`, { isAvailable: !item.isAvailable });
    loadMenu();
  }

  async function restockItem(item) {
    const amount = Number(restockAmounts[item.id]);

    if (!Number.isInteger(amount) || amount <= 0) {
      setError("Enter a valid restock quantity");
      return;
    }

    try {
      setError("");

      await client.put(`/menu/${item.id}`, {
        stockQty: item.stockQty + amount,
        isAvailable: true,
      });

      setRestockAmounts((current) => ({
        ...current,
        [item.id]: "",
      }));

      loadMenu();
    } catch (err) {
      setError(err.response?.data?.error || "Could not restock item");
    }
  }

  async function deleteItem(id) {
    await client.delete(`/menu/${id}`);
    loadMenu();
  }

  const activeOrders = orders.filter((o) => ACTIVE.includes(o.status));

  return (
    <div className="page">
      <h1>Admin Dashboard</h1>
      {error && <div className="error-text">{error}</div>}

      {summary && (
        <div className="grid" style={{ marginBottom: 20 }}>
          <div className="card"><div className="muted">Orders today</div><h2>{summary.totalOrders}</h2></div>
          <div className="card"><div className="muted">Revenue today</div><h2>₹{summary.totalRevenue.toFixed(2)}</h2></div>
          <div className="card"><div className="muted">Items sold</div><h2>{summary.itemsSold}</h2></div>
        </div>
      )}

      {/* Quick Launchpad to TV Display & Kitchen KDS */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <a
          href="/display"
          target="_blank"
          rel="noreferrer"
          className="btn"
          style={{ background: "#0284c7", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          📺 Open TV Queue Display (New Tab)
        </a>

        <a
          href="/kitchen"
          className="btn"
          style={{ background: "#7c3aed", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          👨‍🍳 Open Kitchen KDS View
        </a>
      </div>

      {/* Quick Counter Handover by PIN */}
      <div className="card" style={{ background: "#fdf8f6", borderColor: "#f2dede", marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 8px", color: "var(--navy)" }}>⚡ Quick Counter Handover (Verify 4-Digit PIN)</h3>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: "0.88rem" }}>
          Student arrives at counter? Type their 4-digit PIN below to instantly verify ownership and hand over the meal tray.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const pinInput = e.target.elements.quickPin.value.trim();
            if (!pinInput) return;
            setError("");

            // Find matching order among active orders
            const matched = orders.find((o) => o.pickupPin === pinInput && (o.status === "READY" || o.status === "PREPARING"));
            if (!matched) {
              setError(`No active order found matching PIN "${pinInput}". Check if order is ready.`);
              return;
            }

            try {
              await client.post(`/orders/${matched.id}/verify-pin`, { pin: pinInput });
              e.target.reset();
              loadOrders();
              loadSummary();
            } catch (err) {
              setError(err.response?.data?.error || "Could not verify PIN");
            }
          }}
          style={{ display: "flex", gap: 10, maxWidth: 420 }}
        >
          <input
            name="quickPin"
            placeholder="Enter 4-Digit PIN (e.g. 4819)"
            maxLength={4}
            className="input"
            style={{ marginBottom: 0, fontSize: "1.1rem", fontWeight: 700, letterSpacing: "2px", textAlign: "center" }}
            required
          />
          <button className="btn" type="submit" style={{ whiteSpace: "nowrap" }}>
            Verify & Collect
          </button>
        </form>
      </div>

      <div style={{ marginBottom: 16 }}>
        <button className={`btn small ${tab === "orders" ? "" : "secondary"}`} onClick={() => setTab("orders")}>Order Queue</button>{" "}
        <button className={`btn small ${tab === "menu" ? "" : "secondary"}`} onClick={() => setTab("menu")}>Menu Management</button>
      </div>

      {tab === "orders" && (
        <>
          <h2>Active orders ({activeOrders.length})</h2>
          {activeOrders.length === 0 && <p className="muted">No active orders right now.</p>}
          {activeOrders.map((o) => (
            <div key={o.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>{o.token}</strong> — {o.customer?.name}
                <span style={{ marginLeft: 10, fontSize: "0.85rem", background: "#f0f0f0", padding: "2px 8px", borderRadius: 6, fontWeight: 700 }}>
                  PIN: {o.pickupPin || "----"}
                </span>
                <div className="muted">
                  {o.items.map((i) => `${i.name} x${i.quantity}`).join(", ")}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className={`badge ${o.status}`}>{o.status}</span>
                {o.status !== "COLLECTED" && (
                  <button className="btn small" onClick={() => advanceStatus(o.id)}>
                    Mark {o.status === "PENDING" ? "Preparing" : o.status === "PREPARING" ? "Ready" : "Collected"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "menu" && (
        <>
          <div className="card">
            <h2>Add menu item</h2>
            <form onSubmit={addMenuItem} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 8, alignItems: "center" }}>
              <input className="input" style={{ marginBottom: 0 }} placeholder="Name" value={newItem.name}
                onChange={(e) => setNewItem((f) => ({ ...f, name: e.target.value }))} required />
              <input className="input" style={{ marginBottom: 0 }} placeholder="Price" type="number" step="0.01" value={newItem.price}
                onChange={(e) => setNewItem((f) => ({ ...f, price: e.target.value }))} required />
              <input className="input" style={{ marginBottom: 0 }} placeholder="Category" value={newItem.category}
                onChange={(e) => setNewItem((f) => ({ ...f, category: e.target.value }))} />
              <input className="input" style={{ marginBottom: 0 }} placeholder="Stock" type="number" value={newItem.stockQty}
                onChange={(e) => setNewItem((f) => ({ ...f, stockQty: e.target.value }))} required />
              <button className="btn small">Add</button>
            </form>
          </div>

          <h2>All items</h2>
          {menuItems.map((item) => (
            <div key={item.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong>{item.name}</strong> — ₹{Number(item.price).toFixed(2)} — {item.category}
                <div className="muted">Stock: {item.stockQty}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  className="input"
                  style={{ width: 90, marginBottom: 0 }}
                  type="number"
                  min="1"
                  placeholder="Qty"
                  value={restockAmounts[item.id] || ""}
                  onChange={(e) =>
                    setRestockAmounts((current) => ({
                      ...current,
                      [item.id]: e.target.value,
                    }))
                  }
                />

                <button
                  className="btn small"
                  onClick={() => restockItem(item)}
                >
                  Restock
                </button>

                <button
                  className="btn small secondary"
                  onClick={() => toggleAvailability(item)}
                >
                  {item.isAvailable ? "Mark unavailable" : "Mark available"}
                </button>

                <button
                  className="btn small danger"
                  onClick={() => deleteItem(item.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
