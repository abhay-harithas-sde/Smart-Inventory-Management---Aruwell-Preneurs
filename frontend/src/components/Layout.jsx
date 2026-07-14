import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  LayoutDashboard, Package, ScanBarcode, Receipt, Truck, Wallet,
  Sparkles, Settings, LogOut, Search, Building2, ChevronDown, MessageCircle
} from "lucide-react";
import NLQDialog from "./NLQDialog";
import { Button } from "./ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel
} from "./ui/dropdown-menu";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, testId: "nav-dashboard", end: true },
  { to: "/inventory", label: "Inventory", icon: Package, testId: "nav-inventory" },
  { to: "/pos", label: "POS", icon: ScanBarcode, testId: "nav-pos" },
  { to: "/sales", label: "Sales", icon: Receipt, testId: "nav-sales" },
  { to: "/procurement", label: "Procurement", icon: Truck, testId: "nav-procurement" },
  { to: "/finance", label: "Finance", icon: Wallet, testId: "nav-finance" },
  { to: "/ai", label: "AI Insights", icon: Sparkles, testId: "nav-ai" },
  { to: "/notifications", label: "Notifications", icon: MessageCircle, testId: "nav-notifications" },
];

export default function Layout() {
  const { user, tenant, logout } = useAuth();
  const [nlqOpen, setNlqOpen] = useState(false);
  const nav_ = useNavigate();

  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setNlqOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen flex bg-[#09090B] text-zinc-100">
      {/* Sidebar */}
      <aside className="w-60 border-r border-[#27272A] flex flex-col shrink-0" data-testid="sidebar">
        <div className="h-14 px-5 flex items-center gap-2 border-b border-[#27272A]">
          <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center font-display font-bold text-white">A</div>
          <div className="font-display font-semibold tracking-tight text-[15px]">ATH<span className="text-blue-400">.</span></div>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5" data-testid="sidebar-nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={item.testId}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-colors ${
                  isActive
                    ? "bg-[#18181B] text-white"
                    : "text-zinc-400 hover:text-white hover:bg-[#18181B]"
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-[#27272A]">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2 px-1">Workspace</div>
          <div className="flex items-center gap-2 px-2 py-2 rounded-md bg-[#18181B]">
            <Building2 className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-[12px] truncate" data-testid="tenant-name">{tenant?.name || "—"}</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 border-b border-[#27272A] flex items-center px-6 gap-4 sticky top-0 bg-[#09090B]/95 backdrop-blur z-30">
          <button
            onClick={() => setNlqOpen(true)}
            data-testid="nlq-open-btn"
            className="flex-1 max-w-xl flex items-center gap-2 h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] hover:border-[#3F3F46] transition text-left"
          >
            <Search className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-[13px] text-zinc-500 flex-1">Ask anything about your business…</span>
            <kbd>Ctrl</kbd><kbd>K</kbd>
          </button>

          <div className="flex-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button data-testid="user-menu-btn" className="flex items-center gap-2 h-9 px-2 rounded-md hover:bg-[#18181B] transition">
                <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 grid place-items-center text-[12px] font-medium">
                  {(user?.name || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="text-left leading-tight hidden sm:block">
                  <div className="text-[12px] font-medium">{user?.name}</div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{user?.role}</div>
                </div>
                <ChevronDown className="w-3 h-3 text-zinc-500" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 bg-[#18181B] border-[#27272A]">
              <DropdownMenuLabel className="text-zinc-400 text-[11px]">{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[#27272A]" />
              <DropdownMenuItem onClick={() => nav_("/settings")} data-testid="menu-settings" className="focus:bg-[#27272A]">
                <Settings className="w-3.5 h-3.5 mr-2" /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={logout} data-testid="menu-logout" className="focus:bg-[#27272A] text-red-400 focus:text-red-400">
                <LogOut className="w-3.5 h-3.5 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      <NLQDialog open={nlqOpen} onOpenChange={setNlqOpen} />
    </div>
  );
}
