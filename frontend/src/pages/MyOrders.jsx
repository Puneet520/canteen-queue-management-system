import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import client from "../api/client";

export default function MyOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client
      .get("/orders/mine")
      .then(({ data }) => setOrders(data.orders))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page">Loading...</div>;

  return (
    <div className="page">
      <h1>My Orders</h1>
      {orders.length === 0 && <p className="muted">No orders yet — go grab something from the menu!</p>}
      {orders.map((o) => (
        <Link key={o.id} to={`/orders/${o.id}`} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>{o.token}</strong>
              <div className="muted">{new Date(o.createdAt).toLocaleString()}</div>
            </div>
            <span className={`badge ${o.status}`}>{o.status}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
