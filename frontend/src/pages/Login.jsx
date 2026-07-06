import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function Login() {
  const nav = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("owner@demo.ath");
  const [password, setPassword] = useState("demo1234");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      nav("/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#09090B]">
      <div className="hidden lg:flex relative overflow-hidden border-r border-[#27272A]">
        <div className="absolute inset-0 grid-noise opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent" />
        <div className="relative z-10 p-12 flex flex-col justify-between w-full">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-md bg-blue-500 flex items-center justify-center font-display font-bold text-white text-lg">A</div>
            <div className="font-display font-semibold tracking-tight text-xl">ATH<span className="text-blue-400">.</span></div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mb-3">AI-Augmented ERP</div>
            <h1 className="font-display text-4xl font-semibold tracking-tight mb-4">Run your business at the speed of thought.</h1>
            <p className="text-sm text-zinc-400 max-w-md leading-relaxed">Inventory, POS, procurement, and finance — unified. Ask questions in plain English. Let AI forecast demand.</p>
            <div className="mt-8 flex items-center gap-6 text-[11px] text-zinc-500">
              <div><span className="text-zinc-300 font-mono">01</span> Multi-tenant</div>
              <div><span className="text-zinc-300 font-mono">02</span> Real-time stock</div>
              <div><span className="text-zinc-300 font-mono">03</span> AI insights</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm" data-testid="login-form">
          <div className="mb-8">
            <h2 className="font-display text-2xl font-semibold tracking-tight mb-1">Sign in</h2>
            <p className="text-sm text-zinc-500">Access your workspace</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[11px] uppercase tracking-widest text-zinc-500 mb-1.5 block">Email</label>
              <input
                data-testid="login-email"
                type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-[#18181B] border border-[#27272A] focus:border-blue-500 focus:outline-none text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-zinc-500 mb-1.5 block">Password</label>
              <input
                data-testid="login-password"
                type="password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-[#18181B] border border-[#27272A] focus:border-blue-500 focus:outline-none text-sm"
              />
            </div>
            <button
              type="submit" disabled={loading}
              data-testid="login-submit-btn"
              className="w-full h-10 rounded-md bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-medium text-sm flex items-center justify-center gap-2 transition"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign in
            </button>
          </div>

          <div className="mt-6 text-center text-sm text-zinc-500">
            No workspace yet?{" "}
            <Link to="/signup" data-testid="link-signup" className="text-blue-400 hover:text-blue-300">Create one</Link>
          </div>

          <div className="mt-8 p-3 rounded-md bg-[#18181B] border border-[#27272A] text-[11px] text-zinc-500 leading-relaxed">
            <span className="text-zinc-400 font-medium">Demo:</span> owner@demo.ath / demo1234
          </div>
        </form>
      </div>
    </div>
  );
}
