import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function Signup() {
  const nav = useNavigate();
  const { signup } = useAuth();
  const [form, setForm] = useState({ business_name: "", business_type: "retail", name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signup(form);
      toast.success("Workspace created");
      nav("/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Signup failed");
    } finally { setLoading(false); }
  };

  const set = (k, v) => setForm({ ...form, [k]: v });

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-[#09090B]">
      <div className="flex items-center justify-center p-8 order-2 lg:order-1">
        <form onSubmit={submit} className="w-full max-w-sm" data-testid="signup-form">
          <div className="mb-8">
            <h2 className="font-display text-2xl font-semibold tracking-tight mb-1">Create workspace</h2>
            <p className="text-sm text-zinc-500">Start managing your business</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[11px] uppercase tracking-widest text-zinc-500 mb-1.5 block">Business name</label>
              <input data-testid="signup-business-name" required value={form.business_name} onChange={(e) => set("business_name", e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-[#18181B] border border-[#27272A] focus:border-blue-500 focus:outline-none text-sm" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-zinc-500 mb-1.5 block">Business type</label>
              <select data-testid="signup-business-type" value={form.business_type} onChange={(e) => set("business_type", e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-[#18181B] border border-[#27272A] focus:border-blue-500 focus:outline-none text-sm">
                <option value="retail">Retail</option>
                <option value="pharmacy">Pharmacy</option>
                <option value="distributor">Distributor</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-zinc-500 mb-1.5 block">Your name</label>
              <input data-testid="signup-name" required value={form.name} onChange={(e) => set("name", e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-[#18181B] border border-[#27272A] focus:border-blue-500 focus:outline-none text-sm" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-zinc-500 mb-1.5 block">Email</label>
              <input data-testid="signup-email" type="email" required value={form.email} onChange={(e) => set("email", e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-[#18181B] border border-[#27272A] focus:border-blue-500 focus:outline-none text-sm" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest text-zinc-500 mb-1.5 block">Password</label>
              <input data-testid="signup-password" type="password" required minLength={6} value={form.password} onChange={(e) => set("password", e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-[#18181B] border border-[#27272A] focus:border-blue-500 focus:outline-none text-sm" />
            </div>
            <button type="submit" disabled={loading} data-testid="signup-submit-btn"
              className="w-full h-10 rounded-md bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-medium text-sm flex items-center justify-center gap-2 transition">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Create workspace
            </button>
          </div>

          <div className="mt-6 text-center text-sm text-zinc-500">
            Already have an account?{" "}
            <Link to="/login" data-testid="link-login" className="text-blue-400 hover:text-blue-300">Sign in</Link>
          </div>
        </form>
      </div>

      <div className="hidden lg:flex relative overflow-hidden border-l border-[#27272A] order-1 lg:order-2">
        <div className="absolute inset-0 grid-noise opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-tl from-blue-500/10 via-transparent to-transparent" />
        <div className="relative z-10 p-12 flex flex-col justify-between w-full">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-md bg-blue-500 flex items-center justify-center font-display font-bold text-white text-lg">A</div>
            <div className="font-display font-semibold tracking-tight text-xl">ATH<span className="text-blue-400">.</span></div>
          </div>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight mb-4">Everything your store needs. Nothing it doesn't.</h1>
            <ul className="text-sm text-zinc-400 space-y-2">
              <li>· Real-time inventory across locations</li>
              <li>· Barcode POS with GST invoices</li>
              <li>· PO → GRN → auto stock-in</li>
              <li>· NLQ: "top 5 products last month?"</li>
              <li>· 30-day demand forecasting</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
