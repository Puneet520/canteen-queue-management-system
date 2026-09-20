import { Link, NavLink, useNavigate } from "react-router-dom";
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
        <Link to="/" className="brand navbar-brand">
          <span className="brand-mark">🍽</span>
          <span>Campus Canteen</span>
          <span className="live-dot" title="Kitchen Active" />
          <span className="live-label">Kitchen Active</span>
        </Link>

        {user && user.role !== "ADMIN" && (
          <>
            <NavLink to="/menu" className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}>
              Menu
            </NavLink>
            <NavLink to="/orders" className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}>
              My Orders
            </NavLink>
          </>
        )}

        {user && user.role === "ADMIN" && (
          <>
            <NavLink to="/admin" className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}>
              Admin
            </NavLink>
            <NavLink to="/kitchen" className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}>
              Kitchen KDS
            </NavLink>
          </>
        )}

        <Link to="/display" target="_blank" className="nav-tv-link">
          📺 Wall TV Display
        </Link>
      </div>

      <div className="navbar-user">
        {user ? (
          <>
            <span className="profile-chip">
              <span className="profile-name">{user.name}</span>
              <span className="profile-role">{user.role}</span>
            </span>
            <button type="button" onClick={handleLogout}>
              Logout
            </button>
          </>
        ) : (
          <NavLink to="/login" className="nav-pill">
            Login
          </NavLink>
        )}
      </div>
    </nav>
  );
}
