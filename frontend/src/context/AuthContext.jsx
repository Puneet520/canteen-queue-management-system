import { createContext, useContext, useEffect, useState } from "react";
import client from "../api/client";
import { getSocket, disconnectSocket } from "../socket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("user");
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoading(false);
      return;
    }
    // Restore session on refresh by asking the API who we are.
    client
      .get("/auth/me")
      .then(({ data }) => {
        setUser(data.user);
        localStorage.setItem("user", JSON.stringify(data.user));
        getSocket(data.user);
      })
      .catch(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  function saveSession(user, token) {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    setUser(user);
    getSocket(user);
  }

  async function login(email, password) {
    const { data } = await client.post("/auth/login", { email, password });
    saveSession(data.user, data.token);
    return data.user;
  }

  async function register(name, email, password, role) {
    const { data } = await client.post("/auth/register", { name, email, password, role });
    saveSession(data.user, data.token);
    return data.user;
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    disconnectSocket();
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
