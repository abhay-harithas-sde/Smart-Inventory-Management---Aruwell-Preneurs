import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { fmtCurrency, fmtDateTime } from "../lib/fmt";
import { toast } from "sonner";
import { RotateCcw, MessageCircle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";

export default function Sales() {
  const qc = useQueryClient();
  const [waSale, setWaSale] = useState(null);

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
              <th className="text-right px-3 py-2.5 font-medium">Actions</th>
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
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setWaSale(s)} data-testid={`wa-invoice-${s.invoice_no}`} title="Send invoice via WhatsApp" className="text-zinc-600 hover:text-emerald-400 p-1">
                      <MessageCircle className="w-3.5 h-3.5" />
                    </button>
                    {s.status !== "refunded" && (
                      <button onClick={() => window.confirm(`Refund ${s.invoice_no}?`) && refund.mutate(s.id)} data-testid={`refund-${s.invoice_no}`} title="Refund" className="text-zinc-600 hover:text-red-400 p-1">
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {waSale && <WhatsAppInvoiceDialog sale={waSale} onClose={() => setWaSale(null)} />}
    </div>
  );
}

function WhatsAppInvoiceDialog({ sale, onClose }) {
  const [phone, setPhone] = useState("");
  const send = useMutation({
    mutationFn: async () => (await api.post("/notify/whatsapp/invoice", { sale_id: sale.id, to: phone })).data,
    onSuccess: () => { toast.success(`Invoice ${sale.invoice_no} sent to ${phone}`); onClose(); },
    onError: (e) => toast.error(e?.response?.data?.detail || "Failed"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-[#0C0C0F] border-[#27272A]" data-testid="wa-invoice-dialog">
        <DialogTitle className="font-display text-lg">Send invoice via WhatsApp</DialogTitle>
        <div className="mt-2 text-[12px] text-zinc-500">
          Invoice <span className="font-mono text-zinc-300">{sale.invoice_no}</span> · Total <span className="tabular text-zinc-300">{fmtCurrency(sale.total)}</span>
        </div>

        <div className="mt-4">
          <label className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 block">Customer WhatsApp number (E.164)</label>
          <input
            data-testid="wa-invoice-phone"
            autoFocus
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+919876543210"
            className="w-full h-10 px-3 rounded-md bg-[#18181B] border border-[#27272A] focus:border-blue-500 focus:outline-none text-sm font-mono"
          />
          <div className="text-[10px] text-zinc-600 mt-1.5 leading-relaxed">
            Twilio sandbox: recipient must first send the join code from console.twilio.com to <span className="font-mono">+14155238886</span> to receive WhatsApp messages.
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-[13px]">Cancel</button>
          <button
            onClick={() => send.mutate()}
            disabled={!phone || send.isPending}
            data-testid="wa-invoice-send-btn"
            className="h-9 px-4 rounded-md bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[13px] font-medium flex items-center gap-1.5"
          >
            {send.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
            Send
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
