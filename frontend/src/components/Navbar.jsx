import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <nav className="navbar">
      <div className="navbar-links">
        <Link to="/" className="brand" style={{ marginRight: 24, display: "flex", alignItems: "center", gap: 6 }}>
          <span>🍽</span>
          <span>Canteen Queue</span>
        </Link>

        {user && user.role !== "ADMIN" && (
          <>
            <Link to="/menu">Menu</Link>
            <Link to="/orders">My Orders</Link>
          </>
        )}

        {user && user.role === "ADMIN" && (
          <>
            <Link to="/admin">Admin</Link>
            <Link to="/kitchen">Kitchen KDS</Link>
          </>
        )}

        <Link
          to="/display"
          target="_blank"
          style={{
            background: "rgba(255, 255, 255, 0.15)",
            padding: "4px 10px",
            borderRadius: "6px",
            fontSize: "0.85rem",
          }}
        >
          📺 Live TV Screen
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {user ? (
          <>
            <span style={{ fontSize: "0.9rem" }}>{user.name} ({user.role})</span>
            <button onClick={handleLogout}>Logout</button>
          </>
        ) : (
          <Link to="/login">Login</Link>
        )}
      </div>
    </nav>
  );
}
