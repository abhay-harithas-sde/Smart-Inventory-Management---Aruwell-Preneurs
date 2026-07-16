import React from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../lib/api";
import { fmtCurrency, fmtNumber } from "../lib/fmt";
import { Sparkles, TrendingUp } from "lucide-react";

export default function AIInsights() {
  const { data: forecast, isLoading: fl } = useQuery({ queryKey: ["forecast"], queryFn: async () => (await api.get("/ai/forecast")).data });
  const { data: insights, isLoading: il } = useQuery({ queryKey: ["ai-narr"], queryFn: async () => (await api.get("/ai/insights")).data });

  React.useEffect(() => { document.title = "AI Insights — Smart Ledger"; }, []);

  return (
    <div className="p-6 space-y-4" data-testid="ai-page">
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-1">Intelligence</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">AI Insights</h1>
        <p className="text-sm text-zinc-500 mt-1">Demand forecasting, reorder suggestions, and business narratives</p>
      </div>

      <div className="surface rounded-md p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <h2 className="font-display text-lg font-medium">Business narrative</h2>
        </div>
        <div className="text-[13px] text-zinc-300 leading-relaxed whitespace-pre-wrap" data-testid="ai-narrative">
          {il ? "Analyzing…" : insights?.narrative}
        </div>
      </div>

      <div className="surface rounded-md overflow-hidden" data-testid="forecast-table">
        <div className="px-4 py-3 border-b border-[#27272A] flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-400" />
          <h2 className="font-display text-sm font-medium">30-day demand forecast + reorder suggestions</h2>
        </div>
        <table className="w-full text-[12px]">
          <thead className="bg-[#18181B] text-zinc-500 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium">SKU</th>
              <th className="text-left px-3 py-2.5 font-medium">Product</th>
              <th className="text-right px-3 py-2.5 font-medium">Sold (60d)</th>
              <th className="text-right px-3 py-2.5 font-medium">Avg/day</th>
              <th className="text-right px-3 py-2.5 font-medium">Forecast 30d</th>
              <th className="text-right px-3 py-2.5 font-medium">Current stock</th>
              <th className="text-right px-3 py-2.5 font-medium">Suggest reorder</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#27272A]">
            {fl ? <tr><td colSpan={7} className="text-center py-6 text-zinc-500">Computing forecast…</td></tr>
            : forecast?.forecasts?.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-zinc-500">Not enough sales history yet. Sell more products to build the model.</td></tr>
            : forecast?.forecasts?.map((f) => (
              <tr key={f.product_id} className="hover:bg-[#18181B]/50" data-testid={`forecast-row-${f.sku}`}>
                <td className="px-3 py-2 font-mono text-zinc-400">{f.sku}</td>
                <td className="px-3 py-2">{f.name}</td>
                <td className="px-3 py-2 text-right tabular">{fmtNumber(f.sold_60d)}</td>
                <td className="px-3 py-2 text-right tabular text-zinc-400">{fmtNumber(f.avg_daily)}</td>
                <td className="px-3 py-2 text-right tabular font-medium">{fmtNumber(f.forecast_30d)}</td>
                <td className={`px-3 py-2 text-right tabular ${f.current_stock <= f.reorder_level ? "text-amber-400" : ""}`}>{fmtNumber(f.current_stock)}</td>
                <td className="px-3 py-2 text-right tabular">
                  {f.reorder_qty > 0 ? <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium">+{fmtNumber(f.reorder_qty)}</span> : <span className="text-zinc-600">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
