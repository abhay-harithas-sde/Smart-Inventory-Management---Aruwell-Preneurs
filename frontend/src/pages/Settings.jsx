import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Plus, Copy, CheckCheck, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";

export default function Settings() {
  const qc = useQueryClient();
  const { user, tenant } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", role: "cashier", password: "" });
  const [shareData, setShareData] = useState(null); // { email, password, name, role }

  React.useEffect(() => { document.title = "Settings — Smart Ledger"; }, []);

  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get("/auth/users")).data });

  const invite = useMutation({
    mutationFn: async () => {
      const saved = { ...form }; // snapshot before async
      const data = (await api.post("/auth/invite", saved)).data;
      return { ...data, _form: saved };
    },
    onSuccess: (data) => {
      toast.success(data.email_sent ? "Member invited — email sent ✓" : "Member invited (email not sent)");
      setOpen(false);
      setForm({ email: "", name: "", role: "cashier", password: "" });
      qc.invalidateQueries({ queryKey: ["users"] });
      setShareData({
        email: data._form.email,
        password: data._form.password,
        name: data._form.name,
        role: data._form.role,
        emailSent: data.email_sent,
      });
    },
    onError: (e) => toast.error(e?.response?.data?.detail || "Failed"),
  });

  return (
    <div className="p-6 space-y-4" data-testid="settings-page">
      <div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-1">Workspace</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Settings</h1>
      </div>

      <div className="surface rounded-md p-5">
        <h2 className="font-display text-sm font-medium mb-3">Workspace</h2>
        <div className="grid grid-cols-2 gap-4 text-[13px]">
          <Info label="Name" value={tenant?.name} />
          <Info label="Business type" value={tenant?.business_type} />
          <Info label="Currency" value={tenant?.currency} />
          <Info label="Default tax" value={`${tenant?.default_tax_rate || 18}%`} />
        </div>
      </div>

      <div className="surface rounded-md overflow-hidden">
        <div className="px-4 py-3 border-b border-[#27272A] flex items-center justify-between">
          <h2 className="font-display text-sm font-medium">Team members</h2>
          {(user?.role === "owner" || user?.role === "manager") && (
            <button onClick={() => setOpen(true)} data-testid="invite-btn" className="h-8 px-3 rounded-md bg-blue-500 hover:bg-blue-600 text-[12px] font-medium flex items-center gap-1.5">
              <Plus className="w-3 h-3" /> Invite
            </button>
          )}
        </div>
        <table className="w-full text-[12px]">
          <thead className="bg-[#18181B] text-zinc-500 uppercase tracking-wider text-[10px]">
            <tr><th className="text-left px-3 py-2.5 font-medium">Name</th><th className="text-left px-3 py-2.5 font-medium">Email</th><th className="text-left px-3 py-2.5 font-medium">Role</th></tr>
          </thead>
          <tbody className="divide-y divide-[#27272A]">
            {users.map(u => (
              <tr key={u.id} data-testid={`user-row-${u.email}`}>
                <td className="px-3 py-2 font-medium">{u.name}</td>
                <td className="px-3 py-2 text-zinc-400">{u.email}</td>
                <td className="px-3 py-2"><span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] uppercase tracking-wider">{u.role}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-[#0C0C0F] border-[#27272A]">
          <DialogTitle className="font-display text-lg">Invite member</DialogTitle>
          <div className="space-y-3 mt-3">
            <input data-testid="inv-name" placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-[13px]" />
            <input data-testid="inv-email" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-[13px]" />
            <select data-testid="inv-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-[13px]">
              <option value="cashier">Cashier</option>
              <option value="warehouse">Warehouse</option>
              <option value="accountant">Accountant</option>
              <option value="manager">Manager</option>
            </select>
            <input data-testid="inv-password" placeholder="Temp password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-[13px]" />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setOpen(false)} className="h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-[13px]">Cancel</button>
            <button onClick={() => invite.mutate()} disabled={invite.isPending} data-testid="inv-save-btn" className="h-9 px-4 rounded-md bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-[13px] font-medium">
              {invite.isPending ? "Inviting…" : "Send invite"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share credentials dialog — shown after successful invite */}
      {shareData && <ShareCredentialsDialog data={shareData} onClose={() => { setShareData(null); qc.invalidateQueries({ queryKey: ["users"] }); }} />}
    </div>
  );
}

function ShareCredentialsDialog({ data, onClose }) {
  const loginUrl = window.location.origin + "/login";
  const [copied, setCopied] = useState(false);

  const fullMessage =
    `You've been invited to Smart Ledger as ${data.role}.\n\n` +
    `Login URL: ${loginUrl}\n` +
    `Email: ${data.email}\n` +
    `Password: ${data.password}\n\n` +
    `Please change your password after first login.`;

  const copyAll = () => {
    navigator.clipboard.writeText(fullMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-[#0C0C0F] border-[#27272A]">
        <DialogTitle className="font-display text-lg flex items-center gap-2">
          <span className="text-emerald-400">✓</span> Member added — share credentials
        </DialogTitle>

        <p className="text-[12px] text-zinc-400 mt-1">
          Share these login details with <span className="text-zinc-200 font-medium">{data.name}</span>. They can log in immediately.
        </p>
        {data.emailSent ? (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400">
            <CheckCheck className="w-3 h-3" /> Invite email sent to {data.email}
          </div>
        ) : (
          <div className="mt-2 text-[11px] text-amber-400">⚠ Email could not be sent — share credentials manually below</div>
        )}

        <div className="mt-4 space-y-2">
          <CredRow label="Login URL" value={loginUrl} mono={false} link={loginUrl} />
          <CredRow label="Email" value={data.email} />
          <CredRow label="Password" value={data.password} />
          <CredRow label="Role" value={data.role} />
        </div>

        {/* Full copyable message */}
        <div className="mt-4 rounded-md bg-[#18181B] border border-[#27272A] p-3">
          <pre className="text-[11px] text-zinc-400 whitespace-pre-wrap leading-relaxed">{fullMessage}</pre>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] hover:bg-[#27272A] text-[13px]">Done</button>
          <button onClick={copyAll} className="h-9 px-4 rounded-md bg-blue-500 hover:bg-blue-600 text-white text-[13px] font-medium flex items-center gap-2">
            {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy all"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CredRow({ label, value, mono = true, link }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-[#18181B] border border-[#27272A]">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-0.5">{label}</div>
        <div className={`text-[12px] text-zinc-200 ${mono ? "font-mono" : ""}`}>{value}</div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="p-1.5 rounded hover:bg-[#27272A] text-zinc-500 hover:text-zinc-300">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        <button onClick={copy} className="p-1.5 rounded hover:bg-[#27272A] text-zinc-500 hover:text-zinc-300">
          {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">{label}</div>
      <div className="text-[13px]">{value || "—"}</div>
    </div>
  );
}
