import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "sonner";

import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Dashboard from "@/pages/Dashboard";
import Inventory from "@/pages/Inventory";
import POS from "@/pages/POS";
import Sales from "@/pages/Sales";
import Procurement from "@/pages/Procurement";
import Finance from "@/pages/Finance";
import AIInsights from "@/pages/AIInsights";
import Settings from "@/pages/Settings";
import AuthCallback from "@/pages/AuthCallback";
import Notifications from "@/pages/Notifications";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center bg-[#09090B] text-zinc-500 text-sm">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center bg-[#09090B] text-zinc-500 text-sm">Loading…</div>;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  // Synchronous check during render — MUST run BEFORE ProtectedRoute
  // to prevent race conditions on OAuth callback
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;

  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
      <Route path="/" element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="pos" element={<POS />} />
        <Route path="sales" element={<Sales />} />
        <Route path="procurement" element={<Procurement />} />
        <Route path="finance" element={<Finance />} />
        <Route path="ai" element={<AIInsights />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="dark App">
      <BrowserRouter>
        <AuthProvider>
          <Toaster theme="dark" position="top-right" toastOptions={{ style: { background: "#18181B", border: "1px solid #27272A", color: "#FAFAFA" } }} />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
