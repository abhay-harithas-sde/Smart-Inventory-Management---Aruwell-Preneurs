import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";

export default function Settings() {
  const qc = useQueryClient();
  const { user, tenant } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", role: "cashier", password: "" });

  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: async () => (await api.get("/auth/users")).data });

  const invite = useMutation({
    mutationFn: async () => (await api.post("/auth/invite", form)).data,
    onSuccess: () => { toast.success("Member invited"); qc.invalidateQueries({ queryKey: ["users"] }); setOpen(false); setForm({ email: "", name: "", role: "cashier", password: "" }); },
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
            <button onClick={() => invite.mutate()} data-testid="inv-save-btn" className="h-9 px-4 rounded-md bg-blue-500 hover:bg-blue-600 text-[13px] font-medium">Send invite</button>
          </div>
        </DialogContent>
      </Dialog>
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
