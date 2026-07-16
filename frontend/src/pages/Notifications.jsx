import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { fmtDateTime } from "../lib/fmt";
import { toast } from "sonner";
import { MessageCircle, Send, Phone, AlertTriangle, BarChart3, Loader2 } from "lucide-react";

export default function Notifications() {
  const qc = useQueryClient();
  const [phone, setPhone] = useState("");
  const [body, setBody] = useState("");

  React.useEffect(() => { document.title = "Notifications — Smart Ledger"; }, []);

  const { data: history = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get("/notify/history")).data,
  });

  const onSuccess = (d) => {
    toast.success(`Sent (${d.sid?.slice(-8) || "ok"})`);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  const onError = (e) => toast.error(e?.response?.data?.detail || "Failed");

  const smsMut = useMutation({
    mutationFn: async () => (await api.post("/notify/sms", { to: phone, body })).data,
    onSuccess, onError,
  });
  const waMut = useMutation({
    mutationFn: async () => (await api.post("/notify/whatsapp", { to: phone, body })).data,
    onSuccess, onError,
  });
  const lowMut = useMutation({
    mutationFn: async () => (await api.post("/notify/low-stock-digest", { to: phone, body: "" })).data,
    onSuccess, onError,
  });
  const pnlMut = useMutation({
    mutationFn: async () => (await api.post("/notify/daily-pnl", { to: phone, body: "" })).data,
    onSuccess, onError,
  });

  const anyPending = smsMut.isPending || waMut.isPending || lowMut.isPending || pnlMut.isPending;

  return (
    <div className="p-6 space-y-4" data-testid="notifications-page">
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-1">Outbound</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-zinc-500 mt-1">SMS & WhatsApp via Twilio · Business alerts on demand</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Composer */}
        <div className="surface rounded-md p-5 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 block">Recipient (E.164)</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+919876543210"
              data-testid="notify-phone"
              className="w-full h-10 px-3 rounded-md bg-[#18181B] border border-[#27272A] focus:border-blue-500 focus:outline-none text-sm font-mono"
            />
            <div className="text-[10px] text-zinc-600 mt-1">Include country code, no spaces. WhatsApp sandbox requires the number to be joined first.</div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 block">Message body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your message…"
              rows={5}
              data-testid="notify-body"
              className="w-full px-3 py-2 rounded-md bg-[#18181B] border border-[#27272A] focus:border-blue-500 focus:outline-none text-[13px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => smsMut.mutate()}
              disabled={!phone || !body || anyPending}
              data-testid="send-sms-btn"
              className="h-10 rounded-md bg-[#18181B] border border-[#27272A] hover:border-blue-500/40 disabled:opacity-50 flex items-center justify-center gap-2 text-[13px] font-medium"
            >
              {smsMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />}
              Send SMS
            </button>
            <button
              onClick={() => waMut.mutate()}
              disabled={!phone || !body || anyPending}
              data-testid="send-wa-btn"
              className="h-10 rounded-md bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white flex items-center justify-center gap-2 text-[13px] font-medium"
            >
              {waMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
              Send WhatsApp
            </button>
          </div>
        </div>

        {/* Quick actions */}
        <div className="surface rounded-md p-5 space-y-3">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">Quick alerts</div>

          <button
            onClick={() => lowMut.mutate()}
            disabled={!phone || anyPending}
            data-testid="wa-lowstock-btn"
            className="w-full h-11 rounded-md bg-[#18181B] border border-[#27272A] hover:border-amber-500/40 disabled:opacity-50 flex items-center gap-3 px-4 text-left transition"
          >
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex-1">
              <div className="text-[13px] font-medium">Low-stock digest via WhatsApp</div>
              <div className="text-[11px] text-zinc-500">Auto-composes list of products below reorder level</div>
            </div>
            {lowMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          </button>

          <button
            onClick={() => pnlMut.mutate()}
            disabled={!phone || anyPending}
            data-testid="wa-pnl-btn"
            className="w-full h-11 rounded-md bg-[#18181B] border border-[#27272A] hover:border-blue-500/40 disabled:opacity-50 flex items-center gap-3 px-4 text-left transition"
          >
            <BarChart3 className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="flex-1">
              <div className="text-[13px] font-medium">Today's P&L summary via WhatsApp</div>
              <div className="text-[11px] text-zinc-500">Orders, revenue, and tax collected so far today</div>
            </div>
            {pnlMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          </button>

          <div className="pt-3 mt-2 border-t border-[#27272A] text-[11px] text-zinc-500 leading-relaxed">
            <div className="font-medium text-zinc-400 mb-1">WhatsApp sandbox</div>
            To receive WhatsApp messages during testing, the recipient must first join Twilio's sandbox by sending the join code from console.twilio.com to <span className="font-mono text-zinc-400">+14155238886</span>.
          </div>
        </div>
      </div>

      {/* History */}
      <div className="surface rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-[#27272A] font-display text-sm font-medium">Recent messages</div>
        <table className="w-full text-[12px]">
          <thead className="bg-[#18181B] text-zinc-500 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium">Sent</th>
              <th className="text-left px-3 py-2.5 font-medium">Channel</th>
              <th className="text-left px-3 py-2.5 font-medium">To</th>
              <th className="text-left px-3 py-2.5 font-medium">Body</th>
              <th className="text-left px-3 py-2.5 font-medium">SID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#27272A]">
            {isLoading ? <tr><td colSpan={5} className="text-center py-6 text-zinc-500">Loading…</td></tr>
            : history.length === 0 ? <tr><td colSpan={5} className="text-center py-8 text-zinc-500">No messages sent yet.</td></tr>
            : history.map((n, i) => (
              <tr key={n.provider_sid || i} data-testid={`notif-row-${i}`}>
                <td className="px-3 py-2 text-zinc-400">{fmtDateTime(n.sent_at)}</td>
                <td className="px-3 py-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${n.channel === "whatsapp" ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-500/10 text-blue-400"}`}>
                    {n.channel}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-zinc-400">{n.to}</td>
                <td className="px-3 py-2 text-zinc-400 truncate max-w-md">{n.body}</td>
                <td className="px-3 py-2 font-mono text-zinc-600 text-[10px]">{n.provider_sid?.slice(-10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
