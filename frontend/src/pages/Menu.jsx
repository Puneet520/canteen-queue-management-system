import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../api/client";

export default function Menu() {
  const [items, setItems] = useState([]);
  const [cart, setCart] = useState({}); // menuItemId -> quantity
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [placing, setPlacing] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    client
      .get("/menu")
      .then(({ data }) => setItems(data.items))
      .catch(() => setError("Could not load the menu"))
      .finally(() => setLoading(false));
  }, []);

  function updateQty(id, delta, maxStock) {
    setCart((c) => {
      const next = Math.max(0, Math.min(maxStock, (c[id] || 0) + delta));
      return { ...c, [id]: next };
    });
  }

  const cartLines = Object.entries(cart).filter(([, qty]) => qty > 0);
  const total = cartLines.reduce((sum, [id, qty]) => {
    const item = items.find((i) => i.id === id);
    return sum + (item ? Number(item.price) * qty : 0);
  }, 0);

  async function placeOrder() {
    setError("");
    setPlacing(true);
    try {
      const payload = { items: cartLines.map(([menuItemId, quantity]) => ({ menuItemId, quantity })) };
      const { data } = await client.post("/orders", payload);
      navigate(`/orders/${data.order.id}`);
    } catch (err) {
      setError(err.response?.data?.error || "Could not place order");
    } finally {
      setPlacing(false);
    }
  }

  if (loading) return <div className="page">Loading menu...</div>;

  const categories = [...new Set(items.map((i) => i.category))];

  return (
    <div className="page">
      <h1>Today's Menu</h1>
      {error && <div className="error-text">{error}</div>}

      {categories.map((cat) => (
        <div key={cat} style={{ marginBottom: 22 }}>
          <h2>{cat}</h2>
          <div className="grid">
            {items
              .filter((i) => i.category === cat)
              .map((item) => (
                <div key={item.id} className="card">
                  <strong>{item.name}</strong>
                  <p className="muted">{item.description || "—"}</p>
                  <p>₹{Number(item.price).toFixed(2)}</p>
                  {!item.isAvailable || item.stockQty === 0 ? (
                    <span className="badge CANCELLED">Out of stock</span>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                      <button className="btn small secondary" onClick={() => updateQty(item.id, -1, item.stockQty)}>-</button>
                      <span>{cart[item.id] || 0}</span>
                      <button className="btn small" onClick={() => updateQty(item.id, 1, item.stockQty)}>+</button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}

      {cartLines.length > 0 && (
        <div className="card" style={{ position: "sticky", bottom: 16 }}>
          <h2>Your cart</h2>
          <table>
            <tbody>
              {cartLines.map(([id, qty]) => {
                const item = items.find((i) => i.id === id);
                return (
                  <tr key={id}>
                    <td>{item.name}</td>
                    <td>x{qty}</td>
                    <td>₹{(Number(item.price) * qty).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ marginTop: 10 }}><strong>Total: ₹{total.toFixed(2)}</strong> — Pay at counter</p>
          <button className="btn" onClick={placeOrder} disabled={placing}>
            {placing ? "Placing order..." : "Place pre-order"}
          </button>
        </div>
      )}
    </div>
  );
}
