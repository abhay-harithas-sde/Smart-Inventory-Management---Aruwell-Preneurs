import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { fmtCurrency, fmtDate } from "../lib/fmt";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";

export default function Finance() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "", amount: 0, note: "" });

  React.useEffect(() => { document.title = "Finance — Smart Ledger"; }, []);

  const { data: pnl, isLoading: pnlLoading } = useQuery({ queryKey: ["pnl"], queryFn: async () => (await api.get("/finance/pnl")).data });
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses"], queryFn: async () => (await api.get("/finance/expenses")).data });

  const save = useMutation({
    mutationFn: async () => (await api.post("/finance/expenses", form)).data,
    onSuccess: () => { toast.success("Expense added"); qc.invalidateQueries({ queryKey: ["expenses"] }); qc.invalidateQueries({ queryKey: ["pnl"] }); setOpen(false); setForm({ category: "", amount: 0, note: "" }); },
    onError: (e) => toast.error(e?.response?.data?.detail || "Failed"),
  });

  const Metric = ({ label, value, tone }) => (
    <div className="surface rounded-md p-4">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">{label}</div>
      {pnlLoading
        ? <div className="h-8 w-24 rounded bg-[#27272A] animate-pulse" />
        : <div className={`font-display text-2xl font-semibold tabular ${tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : ""}`}>{fmtCurrency(value)}</div>
      }
    </div>
  );

  return (
    <div className="p-6 space-y-4" data-testid="finance-page">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-1">Books</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Finance</h1>
        </div>
        <button onClick={() => setOpen(true)} data-testid="new-expense-btn" className="h-9 px-3 rounded-md bg-blue-500 hover:bg-blue-600 text-[13px] font-medium flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New expense
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3" data-testid="pnl-grid">
        <Metric label="Revenue" value={pnl?.revenue || 0} />
        <Metric label="COGS" value={pnl?.cogs || 0} />
        <Metric label="Gross profit" value={pnl?.gross_profit || 0} tone="good" />
        <Metric label="Expenses" value={pnl?.expenses || 0} tone="bad" />
        <Metric label="Net profit" value={pnl?.net_profit || 0} tone={pnl?.net_profit >= 0 ? "good" : "bad"} />
      </div>

      <div className="surface rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-[#27272A] font-display text-sm font-medium">Expenses</div>
        <table className="w-full text-[12px]">
          <thead className="bg-[#18181B] text-zinc-500 uppercase tracking-wider text-[10px]">
            <tr><th className="text-left px-3 py-2.5 font-medium">Date</th><th className="text-left px-3 py-2.5 font-medium">Category</th><th className="text-left px-3 py-2.5 font-medium">Note</th><th className="text-right px-3 py-2.5 font-medium">Amount</th></tr>
          </thead>
          <tbody className="divide-y divide-[#27272A]">
            {expenses.length === 0 ? <tr><td colSpan={4} className="text-center py-8 text-zinc-500">No expenses recorded.</td></tr>
            : expenses.map(e => (
              <tr key={e.id} data-testid={`expense-${e.id}`}><td className="px-3 py-2 text-zinc-400">{fmtDate(e.date)}</td><td className="px-3 py-2">{e.category}</td><td className="px-3 py-2 text-zinc-400">{e.note}</td><td className="px-3 py-2 text-right tabular font-medium">{fmtCurrency(e.amount)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-[#0C0C0F] border-[#27272A]">
          <DialogTitle className="font-display text-lg">New expense</DialogTitle>
          <div className="space-y-3 mt-3">
            <input data-testid="exp-category" placeholder="Category (rent, utilities…)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-[13px]" />
            <input data-testid="exp-amount" type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} className="w-full h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-[13px]" />
            <textarea data-testid="exp-note" placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full px-3 py-2 rounded-md bg-[#18181B] border border-[#27272A] text-[13px]" rows={3} />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setOpen(false)} className="h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-[13px]">Cancel</button>
            <button onClick={() => {
              if (!form.category.trim()) { toast.error("Category is required"); return; }
              if (form.amount <= 0) { toast.error("Amount must be greater than zero"); return; }
              save.mutate();
            }} data-testid="exp-save-btn" className="h-9 px-4 rounded-md bg-blue-500 hover:bg-blue-600 text-[13px] font-medium">Save</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
