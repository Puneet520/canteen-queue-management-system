import { useEffect, useState } from "react";
import client from "../api/client";
import { getSocket } from "../socket";
import { useAuth } from "../context/AuthContext";
import MenuItemForm from "../components/MenuItemForm";
import VegBadge from "../components/VegBadge";

const ACTIVE = ["PENDING", "PREPARING", "READY"];

export default function AdminDashboard() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [tab, setTab] = useState("orders"); // orders | menu
  const [menuItems, setMenuItems] = useState([]);
  const [error, setError] = useState("");
  const [restockAmounts, setRestockAmounts] = useState({});
  const [addFormKey, setAddFormKey] = useState(0); // bump to reset the add form
  const [editingItem, setEditingItem] = useState(null);
  const [savingItem, setSavingItem] = useState(false);

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

  async function addMenuItem(payload) {
    setError("");
    setSavingItem(true);
    try {
      await client.post("/menu", payload);
      setAddFormKey((k) => k + 1); // reset the form
      loadMenu();
    } catch (err) {
      setError(err.response?.data?.error || "Could not add item");
    } finally {
      setSavingItem(false);
    }
  }

  async function saveEdit(payload) {
    if (!editingItem) return;
    setError("");
    setSavingItem(true);
    try {
      await client.put(`/menu/${editingItem.id}`, payload);
      setEditingItem(null);
      loadMenu();
    } catch (err) {
      setError(err.response?.data?.error || "Could not save changes");
    } finally {
      setSavingItem(false);
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
            <MenuItemForm
              key={addFormKey}
              onSubmit={addMenuItem}
              submitLabel="Add item"
              busy={savingItem}
            />
          </div>

          <h2>All items ({menuItems.length})</h2>
          {menuItems.map((item) => {
            const unavailable = !item.isAvailable || item.stockQty === 0;
            return (
              <div key={item.id} className="card admin-menu-row">
                <div className="admin-menu-thumb">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} loading="lazy" />
                  ) : (
                    <span>🍽️</span>
                  )}
                </div>

                <div className="admin-menu-info">
                  <div className="admin-menu-name">
                    <VegBadge type={item.foodType} isJain={item.isJain} size={14} />
                    <strong>{item.name}</strong>
                    {unavailable && <span className="badge CANCELLED">Out</span>}
                  </div>
                  <div className="muted">
                    ₹{Number(item.price).toFixed(2)} · {item.category} · Stock: {item.stockQty}
                    {item.ratingCount > 0 && (
                      <> · ★ {item.avgRating.toFixed(1)} ({item.ratingCount})</>
                    )}
                  </div>
                </div>

                <div className="admin-menu-actions">
                  <input
                    className="input"
                    style={{ width: 80, marginBottom: 0 }}
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

                  <button className="btn small" onClick={() => restockItem(item)}>
                    Restock
                  </button>

                  <button className="btn small secondary" onClick={() => setEditingItem(item)}>
                    Edit
                  </button>

                  <button
                    className="btn small secondary"
                    onClick={() => toggleAvailability(item)}
                  >
                    {item.isAvailable ? "Hide" : "Show"}
                  </button>

                  <button className="btn small danger" onClick={() => deleteItem(item.id)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Edit item modal */}
      {editingItem && (
        <div className="modal-backdrop" onClick={() => setEditingItem(null)}>
          <div
            className="item-modal admin-edit-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${editingItem.name}`}
          >
            <button
              className="modal-close"
              onClick={() => setEditingItem(null)}
              aria-label="Close"
            >
              ×
            </button>
            <div className="item-modal-body">
              <h2 style={{ marginTop: 0 }}>Edit “{editingItem.name}”</h2>
              <MenuItemForm
                initial={editingItem}
                onSubmit={saveEdit}
                submitLabel="Save changes"
                busy={savingItem}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
