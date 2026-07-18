import React, { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../lib/api";
import { fmtCurrency, fmtNumber } from "../lib/fmt";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Package, AlertTriangle, Clock, Truck, IndianRupee, Sparkles, Volume2, Loader2 } from "lucide-react";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";

const CHART_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899"];

function KpiCard({ icon: Icon, label, value, hint, testId, tone = "default" }) {
  const toneMap = {
    default: "text-zinc-400",
    warn: "text-amber-400",
    danger: "text-red-400",
    good: "text-emerald-400",
  };
  return (
    <div className="surface rounded-md p-4" data-testid={testId}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</span>
        <Icon className={`w-3.5 h-3.5 ${toneMap[tone]}`} />
      </div>
      <div className="font-display text-2xl font-semibold tabular tracking-tight">{value}</div>
      {hint && <div className="text-[11px] text-zinc-500 mt-1">{hint}</div>}
    </div>
  );
}

function SpeakButton({ text }) {
  const [loading, setLoading] = useState(false);
  const audioRef = useRef(null);

  /** Browser Web Speech API fallback — works on all modern browsers, zero cost. */
  const speakBrowser = (txt) => {
    if (!("speechSynthesis" in window)) {
      toast.error("Text-to-speech not supported in this browser.");
      return;
    }
    window.speechSynthesis.cancel(); // stop any current speech
    const utterance = new SpeechSynthesisUtterance(txt);
    utterance.rate = 1;
    utterance.pitch = 1;
    // Prefer an English voice if available
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find((v) => v.lang.startsWith("en"));
    if (enVoice) utterance.voice = enVoice;
    window.speechSynthesis.speak(utterance);
  };

  const speak = async () => {
    if (!text) return;
    setLoading(true);
    try {
      const resp = await api.post("/tts/speak", { text }, { responseType: "blob" });

      if (resp.status === 402) {
        // ElevenLabs free-tier limitation — fall back to browser TTS silently
        const errData = await resp.data.text().then(t => JSON.parse(t)).catch(() => ({}));
        const detail = errData?.detail ?? errData;
        if (detail?.use_browser_tts) {
          speakBrowser(text);
          return;
        }
        throw new Error(detail?.message || "ElevenLabs free tier limitation.");
      }

      const blob = resp.data;
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
        audioRef.current.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
      }
    } catch (e) {
      // If anything goes wrong, still try browser TTS so the user gets audio
      if (e?.name !== "AbortError") {
        speakBrowser(text);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={speak}
        disabled={!text || loading}
        data-testid="tts-speak-btn"
        className="h-7 px-2.5 rounded bg-[#18181B] border border-[#27272A] hover:border-blue-500/40 disabled:opacity-50 flex items-center gap-1.5 text-[11px] text-zinc-400 transition"
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
        Read aloud
      </button>
      <audio ref={audioRef} className="hidden" />
    </>
  );
}

export default function Dashboard() {
  const { tenant } = useAuth();
  const { data, isLoading, isError } = useQuery({ queryKey: ["dashboard-summary"], queryFn: async () => (await api.get("/dashboard/summary")).data });
  const { data: insights } = useQuery({ queryKey: ["ai-insights"], queryFn: async () => (await api.get("/ai/insights")).data, staleTime: 5 * 60 * 1000 });

  React.useEffect(() => { document.title = "Dashboard — Smart Ledger"; }, []);

  if (isLoading) return <div className="p-8 text-sm text-zinc-500">Loading…</div>;
  if (isError) return (
    <div className="p-8 text-sm text-red-400 flex flex-col items-center gap-2">
      <AlertTriangle className="w-5 h-5" />
      <span>Failed to load dashboard data. Check your connection and try refreshing.</span>
    </div>
  );
  const s = data || {};

  return (
    <div className="p-6 space-y-6" data-testid="dashboard-page">
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-1">Overview</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-1">Live snapshot of {tenant?.name}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={IndianRupee} label="Today's revenue" value={fmtCurrency(s.today_revenue)} testId="kpi-today-revenue" />
        <KpiCard icon={TrendingUp} label="Today's orders" value={fmtNumber(s.today_orders)} testId="kpi-today-orders" />
        <KpiCard icon={Package} label="Stock value" value={fmtCurrency(s.stock_value)} testId="kpi-stock-value" />
        <KpiCard icon={AlertTriangle} label="Low stock" value={fmtNumber(s.low_stock_count)} testId="kpi-low-stock" tone={s.low_stock_count ? "warn" : "default"} />
        <KpiCard icon={Clock} label="Expiring 60d" value={fmtNumber(s.expiring_soon)} testId="kpi-expiring" tone={s.expiring_soon ? "danger" : "default"} />
        <KpiCard icon={Truck} label="Pending POs" value={fmtNumber(s.pending_pos)} testId="kpi-pending-pos" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 surface rounded-md p-5" data-testid="chart-sales-trend">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-lg font-medium">Sales trend</h3>
              <div className="text-[11px] text-zinc-500">Last 30 days</div>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={s.sales_trend || []}>
                <CartesianGrid stroke="#27272A" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#71717A", fontSize: 10 }} tickFormatter={(v) => v?.slice(5)} />
                <YAxis tick={{ fill: "#71717A", fontSize: 10 }} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: "#18181B", border: "1px solid #27272A", borderRadius: 6, fontSize: 12 }} formatter={(v) => fmtCurrency(v)} />
                <Line type="monotone" dataKey="total" stroke="#3B82F6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface rounded-md p-5" data-testid="ai-insights-panel">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <h3 className="font-display text-lg font-medium">AI insights</h3>
            </div>
            <SpeakButton text={insights?.narrative} />
          </div>
          <div className="text-[13px] text-zinc-400 leading-relaxed whitespace-pre-wrap">
            {insights?.narrative || "Generating insights…"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="surface rounded-md p-5" data-testid="chart-top-products">
          <h3 className="font-display text-lg font-medium mb-4">Top products (30d)</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={s.top_products || []} layout="vertical">
                <CartesianGrid stroke="#27272A" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#71717A", fontSize: 10 }} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fill: "#A1A1AA", fontSize: 11 }} width={130} />
                <Tooltip contentStyle={{ background: "#18181B", border: "1px solid #27272A", borderRadius: 6, fontSize: 12 }} formatter={(v) => fmtCurrency(v)} />
                <Bar dataKey="revenue" fill="#3B82F6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface rounded-md p-5" data-testid="chart-category-mix">
          <h3 className="font-display text-lg font-medium mb-4 text-white">Category mix (30d)</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={s.category_mix || []} dataKey="value" nameKey="category" cx="50%" cy="50%" outerRadius={90} innerRadius={50} strokeWidth={2} stroke="#09090B">
                  {(s.category_mix || []).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#18181B", border: "1px solid #27272A", borderRadius: 6, fontSize: 12 }} formatter={(v) => fmtCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
            {(s.category_mix || []).map((c, i) => (
              <div key={c.category} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="text-zinc-400">{c.category}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
