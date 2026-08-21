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
        <span className="brand" style={{ marginRight: 24 }}>🍽 Canteen Queue</span>
        {user && user.role !== "ADMIN" && (
          <>
            <Link to="/menu">Menu</Link>
            <Link to="/orders">My Orders</Link>
          </>
        )}
        {user && user.role === "ADMIN" && <Link to="/admin">Admin Dashboard</Link>}
      </div>
      <div>
        {user ? (
          <>
            <span style={{ marginRight: 14 }}>{user.name} ({user.role})</span>
            <button onClick={handleLogout}>Logout</button>
          </>
        ) : (
          <Link to="/login">Login</Link>
        )}
      </div>
    </nav>
  );
}
