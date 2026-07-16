import React, { useState } from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { Sparkles, Send, Loader2, Table as TableIcon, BarChart3, TrendingUp, PieChart as PieChartIcon } from "lucide-react";
import api from "../lib/api";
import { fmtCurrency, fmtNumber } from "../lib/fmt";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const SUGGESTIONS = [
  "What were my top 5 products last month?",
  "How much revenue did I make today?",
  "Which products are running low on stock?",
  "Show me sales by category last 30 days",
];

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4"];

export default function NLQDialog({ open, onOpenChange }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const ask = async (question) => {
    const query = question ?? q;
    if (!query.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await api.post("/ai/nlq", { question: query });
      setResult(r.data);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  };

  const columns = result?.rows?.length ? Object.keys(result.rows[0]).filter(k => k !== "tenant_id") : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-[#0C0C0F] border-[#27272A] p-0 overflow-hidden" data-testid="nlq-dialog">
        <div className="p-4 border-b border-[#27272A] flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <input
            data-testid="nlq-input"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
            placeholder="Ask about your sales, stock, customers…"
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-zinc-600"
          />
          <button
            onClick={() => ask()}
            disabled={loading}
            data-testid="nlq-submit-btn"
            className="h-8 px-3 rounded-md bg-blue-500 hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1.5 text-[13px] font-medium"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Ask
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto">
          {!result && !error && !loading && (
            <div className="p-6">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">Suggested questions</div>
              <div className="grid gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    data-testid={`nlq-suggest-${s.slice(0, 10)}`}
                    onClick={() => { setQ(s); ask(s); }}
                    className="text-left px-3 py-2.5 rounded-md bg-[#18181B] border border-[#27272A] hover:border-blue-500/40 text-[13px] text-zinc-300 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="p-10 flex items-center justify-center text-zinc-500 text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
            </div>
          )}

          {error && (
            <div className="p-6">
              <div className="p-4 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-sm" data-testid="nlq-error">{error}</div>
            </div>
          )}

          {result && (
            <div className="p-4" data-testid="nlq-result">
              {result.explanation && (
                <div className="text-[13px] text-zinc-400 mb-3 leading-relaxed">{result.explanation}</div>
              )}
              <div className="flex items-center gap-2 mb-3 text-[11px] text-zinc-500">
                {result.chart === "bar" ? <BarChart3 className="w-3 h-3" /> : result.chart === "line" ? <TrendingUp className="w-3 h-3" /> : result.chart === "pie" ? <PieChartIcon className="w-3 h-3" /> : <TableIcon className="w-3 h-3" />}
                <span>{result.row_count} rows · {result.collection}</span>
              </div>

              {result.chart === "bar" && result.rows.length > 0 && columns.length >= 2 && (
                <div className="h-64 mb-4">
                  <ResponsiveContainer>
                    <BarChart data={result.rows}>
                      <CartesianGrid stroke="#27272A" vertical={false} />
                      <XAxis dataKey={columns[0]} tick={{ fill: "#71717A", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#71717A", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "#18181B", border: "1px solid #27272A", borderRadius: 6 }} />
                      <Bar dataKey={columns.find(c => typeof result.rows[0][c] === "number") || columns[1]}>
                        {result.rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {result.chart === "line" && result.rows.length > 0 && columns.length >= 2 && (
                <div className="h-64 mb-4">
                  <ResponsiveContainer>
                    <LineChart data={result.rows}>
                      <CartesianGrid stroke="#27272A" vertical={false} />
                      <XAxis dataKey={columns[0]} tick={{ fill: "#71717A", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#71717A", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "#18181B", border: "1px solid #27272A", borderRadius: 6 }} />
                      <Line type="monotone" dataKey={columns.find(c => typeof result.rows[0][c] === "number") || columns[1]} stroke="#3B82F6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {result.chart === "pie" && result.rows.length > 0 && columns.length >= 2 && (
                <div className="h-64 mb-4">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={result.rows}
                        dataKey={columns.find(c => typeof result.rows[0][c] === "number") || columns[1]}
                        nameKey={columns[0]}
                        cx="50%" cy="50%"
                        outerRadius={90} innerRadius={50}
                        strokeWidth={2} stroke="#09090B"
                      >
                        {result.rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#18181B", border: "1px solid #27272A", borderRadius: 6 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-2 mt-1 text-[11px]">
                    {result.rows.map((row, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-zinc-400">{String(row[columns[0]] ?? "")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border border-[#27272A] rounded-md overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead className="bg-[#18181B] text-zinc-500 uppercase tracking-wider text-[10px]">
                    <tr>
                      {columns.map((c) => <th key={c} className="text-left px-3 py-2 font-medium">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#27272A]">
                    {result.rows.slice(0, 50).map((row, i) => (
                      <tr key={i} className="hover:bg-[#18181B]/50">
                        {columns.map((c) => (
                          <td key={c} className="px-3 py-2 tabular text-zinc-300">
                            {typeof row[c] === "number"
                              ? (c.match(/price|total|revenue|cost|amount|value/i) ? fmtCurrency(row[c]) : fmtNumber(row[c]))
                              : (typeof row[c] === "object" ? JSON.stringify(row[c]) : String(row[c] ?? "—"))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
