import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const DEMO = {
  student: { email: "student@canteen.edu", password: "Student@123" },
  admin: { email: "admin@canteen.edu", password: "Admin@123" },
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function signIn(nextEmail, nextPassword) {
    setError("");
    setSubmitting(true);
    try {
      const user = await login(nextEmail, nextPassword);
      navigate(user.role === "ADMIN" ? "/admin" : "/menu");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    signIn(email, password);
  }

  return (
    <div className="page auth-page">
      <div className="auth-split">
        <aside className="auth-hero">
          <p className="menu-eyebrow">CAMPUS FOOD-TECH</p>
          <h1>Skip the canteen queue.</h1>
          <p>Order from your phone, watch live kitchen ETAs, and pick up with a 4-digit PIN.</p>
          <ul className="auth-features">
            <li>Skip Canteen Queues</li>
            <li>Smart Cooking ETAs</li>
            <li>4-Digit PIN Security</li>
          </ul>
        </aside>

        <div className="card form-card auth-form-panel">
          <h1>Log in</h1>
          {error && <div className="error-text">{error}</div>}
          <form onSubmit={handleSubmit}>
            <label className="floating-field">
              <span>College email</span>
              <input
                className="input"
                type="email"
                placeholder=" "
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="floating-field">
              <span>Password</span>
              <input
                className="input"
                type="password"
                placeholder=" "
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button className="btn" style={{ width: "100%" }} disabled={submitting}>
              {submitting ? "Logging in..." : "Log in"}
            </button>
          </form>

          <div className="demo-login-row">
            <p className="muted">Viva demo — no typing</p>
            <button
              type="button"
              className="btn secondary demo-btn"
              disabled={submitting}
              onClick={() => signIn(DEMO.student.email, DEMO.student.password)}
            >
              👨‍🎓 Student Demo
            </button>
            <button
              type="button"
              className="btn secondary demo-btn"
              disabled={submitting}
              onClick={() => signIn(DEMO.admin.email, DEMO.admin.password)}
            >
              👨‍🍳 Canteen Admin
            </button>
          </div>

          <p className="muted" style={{ marginTop: 14 }}>
            No account? <Link to="/register">Register here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
