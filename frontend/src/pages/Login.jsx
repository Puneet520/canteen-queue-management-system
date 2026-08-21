import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = await login(email, password);
      navigate(user.role === "ADMIN" ? "/admin" : "/menu");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <div className="card form-card">
        <h1>Log in</h1>
        {error && <div className="error-text">{error}</div>}
        <form onSubmit={handleSubmit}>
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="btn" style={{ width: "100%" }} disabled={submitting}>
            {submitting ? "Logging in..." : "Log in"}
          </button>
        </form>
        <p className="muted" style={{ marginTop: 14 }}>
          No account? <Link to="/register">Register here</Link>
        </p>
        <p className="muted">Admin demo login: admin@canteen.edu / Admin@123</p>
      </div>
    </div>
  );
}
