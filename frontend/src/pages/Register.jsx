import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "STUDENT" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await register(form.name, form.email, form.password, form.role);
      navigate("/menu");
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page auth-page">
      <div className="auth-split">
        <aside className="auth-hero">
          <p className="menu-eyebrow">JOIN THE QUEUE-SKIPPERS</p>
          <h1>Create your campus canteen pass.</h1>
          <p>Pre-order between classes, track cooking live, and collect with a PIN.</p>
          <ul className="auth-features">
            <li>Skip Canteen Queues</li>
            <li>Smart Cooking ETAs</li>
            <li>4-Digit PIN Security</li>
          </ul>
        </aside>

        <div className="card form-card auth-form-panel">
          <h1>Create account</h1>
          {error && <div className="error-text">{error}</div>}
          <form onSubmit={handleSubmit}>
            <label className="floating-field">
              <span>Full name</span>
              <input
                className="input"
                placeholder=" "
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                required
              />
            </label>
            <label className="floating-field">
              <span>College email</span>
              <input
                className="input"
                type="email"
                placeholder=" "
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                required
              />
            </label>
            <label className="floating-field">
              <span>Password (min 8 characters)</span>
              <input
                className="input"
                type="password"
                placeholder=" "
                minLength={8}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                required
              />
            </label>
            <label className="floating-field">
              <span>Role</span>
              <select className="input" value={form.role} onChange={(e) => update("role", e.target.value)}>
                <option value="STUDENT">Student</option>
                <option value="FACULTY">Faculty</option>
              </select>
            </label>
            <button className="btn" style={{ width: "100%" }} disabled={submitting}>
              {submitting ? "Creating..." : "Create account"}
            </button>
          </form>
          <p className="muted" style={{ marginTop: 14 }}>
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
