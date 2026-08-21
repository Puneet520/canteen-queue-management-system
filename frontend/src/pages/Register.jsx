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
    <div className="page">
      <div className="card form-card">
        <h1>Create account</h1>
        {error && <div className="error-text">{error}</div>}
        <form onSubmit={handleSubmit}>
          <input
            className="input"
            placeholder="Full name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            required
          />
          <input
            className="input"
            type="email"
            placeholder="College email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password (min 8 characters)"
            minLength={8}
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            required
          />
          <select className="input" value={form.role} onChange={(e) => update("role", e.target.value)}>
            <option value="STUDENT">Student</option>
            <option value="FACULTY">Faculty</option>
          </select>
          <button className="btn" style={{ width: "100%" }} disabled={submitting}>
            {submitting ? "Creating..." : "Create account"}
          </button>
        </form>
        <p className="muted" style={{ marginTop: 14 }}>
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
