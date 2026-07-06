import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { fmtCurrency, fmtDateTime } from "../lib/fmt";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";

export default function Sales() {
  const qc = useQueryClient();
  const { data: sales = [], isLoading } = useQuery({ queryKey: ["sales"], queryFn: async () => (await api.get("/pos/sales?limit=200")).data });

  const refund = useMutation({
    mutationFn: async (sid) => (await api.post(`/pos/sales/${sid}/refund`)).data,
    onSuccess: () => { toast.success("Refunded"); qc.invalidateQueries({ queryKey: ["sales"] }); },
    onError: (e) => toast.error(e?.response?.data?.detail || "Failed"),
  });

  return (
    <div className="p-6 space-y-4" data-testid="sales-page">
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-1">Transactions</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Sales</h1>
        <p className="text-sm text-zinc-500 mt-1">{sales.length} recent orders</p>
      </div>

      <div className="surface rounded-md overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="bg-[#18181B] text-zinc-500 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium">Invoice</th>
              <th className="text-left px-3 py-2.5 font-medium">Date</th>
              <th className="text-left px-3 py-2.5 font-medium">Customer</th>
              <th className="text-left px-3 py-2.5 font-medium">Items</th>
              <th className="text-center px-3 py-2.5 font-medium">Payment</th>
              <th className="text-right px-3 py-2.5 font-medium">Total</th>
              <th className="text-center px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#27272A]">
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-6 text-zinc-500">Loading…</td></tr>
            ) : sales.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-zinc-500">No sales yet.</td></tr>
            ) : sales.map((s) => (
              <tr key={s.id} className="hover:bg-[#18181B]/50" data-testid={`sale-row-${s.invoice_no}`}>
                <td className="px-3 py-2 font-mono text-zinc-300">{s.invoice_no}</td>
                <td className="px-3 py-2 text-zinc-400">{fmtDateTime(s.created_at)}</td>
                <td className="px-3 py-2 text-zinc-300">{s.customer_name || "Walk-in"}</td>
                <td className="px-3 py-2 text-zinc-400">{s.lines.length}</td>
                <td className="px-3 py-2 text-center uppercase text-[10px] tracking-wider text-zinc-500">{s.payment_mode}</td>
                <td className="px-3 py-2 text-right tabular font-medium">{fmtCurrency(s.total)}</td>
                <td className="px-3 py-2 text-center">
                  {s.status === "refunded"
                    ? <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 text-[10px] uppercase tracking-wider">Refunded</span>
                    : <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] uppercase tracking-wider">Paid</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {s.status !== "refunded" && (
                    <button onClick={() => window.confirm(`Refund ${s.invoice_no}?`) && refund.mutate(s.id)} data-testid={`refund-${s.invoice_no}`} className="text-zinc-600 hover:text-red-400 p-1">
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
