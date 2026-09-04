import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Menu from "./pages/Menu";
import MyOrders from "./pages/MyOrders";
import OrderStatus from "./pages/OrderStatus";
import AdminDashboard from "./pages/AdminDashboard";
import KitchenKDS from "./pages/KitchenKDS";
import CanteenDisplay from "./pages/CanteenDisplay";

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "ADMIN" ? "/admin" : "/menu"} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Full-Screen TV Display — No navbar shell for clean kiosk view */}
          <Route path="/display" element={<CanteenDisplay />} />

          {/* Standard Application Routes with Navbar */}
          <Route
            path="*"
            element={
              <div className="app-shell">
                <Navbar />
                <Routes>
                  <Route path="/" element={<HomeRedirect />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />

                  <Route path="/menu" element={<ProtectedRoute><Menu /></ProtectedRoute>} />
                  <Route path="/orders" element={<ProtectedRoute><MyOrders /></ProtectedRoute>} />
                  <Route path="/orders/:id" element={<ProtectedRoute><OrderStatus /></ProtectedRoute>} />

                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute requireRole="ADMIN">
                        <AdminDashboard />
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/kitchen"
                    element={
                      <ProtectedRoute requireRole="ADMIN">
                        <KitchenKDS />
                      </ProtectedRoute>
                    }
                  />

                  <Route path="*" element={<div className="page">Page not found</div>} />
                </Routes>
              </div>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
