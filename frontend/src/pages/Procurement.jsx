import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { fmtCurrency, fmtDate } from "../lib/fmt";
import { toast } from "sonner";
import { Plus, Truck, Package as PackageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";

export default function Procurement() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("pos");
  const [poOpen, setPoOpen] = useState(false);
  const [supOpen, setSupOpen] = useState(false);
  const [grnOpen, setGrnOpen] = useState(null);

  React.useEffect(() => { document.title = "Procurement — Smart Ledger"; }, []);

  const { data: pos = [] } = useQuery({ queryKey: ["po"], queryFn: async () => (await api.get("/procurement/pos")).data });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: async () => (await api.get("/procurement/suppliers")).data });
  const { data: locations = [] } = useQuery({ queryKey: ["locations"], queryFn: async () => (await api.get("/inventory/locations")).data });
  const { data: products = [] } = useQuery({ queryKey: ["products-proc"], queryFn: async () => (await api.get("/inventory/products")).data });

  return (
    <div className="p-6 space-y-4" data-testid="procurement-page">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-1">Supply chain</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Procurement</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setSupOpen(true)} data-testid="new-supplier-btn" className="h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] hover:bg-[#27272A] text-[13px] flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Supplier
          </button>
          <button onClick={() => setPoOpen(true)} data-testid="new-po-btn" className="h-9 px-3 rounded-md bg-blue-500 hover:bg-blue-600 text-[13px] font-medium flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New PO
          </button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-[#27272A]">
        {[{ k: "pos", l: "Purchase Orders", i: Truck }, { k: "suppliers", l: "Suppliers", i: PackageIcon }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} data-testid={`tab-${t.k}`} className={`h-9 px-4 text-[12px] flex items-center gap-1.5 border-b-2 transition ${tab === t.k ? "border-blue-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
            <t.i className="w-3.5 h-3.5" /> {t.l}
          </button>
        ))}
      </div>

      {tab === "pos" && (
        <div className="surface rounded-md overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-[#18181B] text-zinc-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium">PO No.</th>
                <th className="text-left px-3 py-2.5 font-medium">Supplier</th>
                <th className="text-left px-3 py-2.5 font-medium">Date</th>
                <th className="text-right px-3 py-2.5 font-medium">Items</th>
                <th className="text-right px-3 py-2.5 font-medium">Total</th>
                <th className="text-center px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#27272A]">
              {pos.length === 0 ? <tr><td colSpan={7} className="text-center py-8 text-zinc-500">No purchase orders yet.</td></tr>
              : pos.map(p => (
                <tr key={p.id} className="hover:bg-[#18181B]/50" data-testid={`po-row-${p.po_no}`}>
                  <td className="px-3 py-2 font-mono">{p.po_no}</td>
                  <td className="px-3 py-2">{p.supplier_name}</td>
                  <td className="px-3 py-2 text-zinc-400">{fmtDate(p.created_at)}</td>
                  <td className="px-3 py-2 text-right">{p.lines.length}</td>
                  <td className="px-3 py-2 text-right tabular font-medium">{fmtCurrency(p.total)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                      p.status === "received" ? "bg-emerald-500/10 text-emerald-400"
                      : p.status === "partial" ? "bg-amber-500/10 text-amber-400"
                      : "bg-blue-500/10 text-blue-400"
                    }`}>{p.status}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.status !== "received" && (
                      <button onClick={() => setGrnOpen(p)} data-testid={`grn-${p.po_no}`} className="h-7 px-2.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[11px] font-medium">Receive</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "suppliers" && (
        <div className="surface rounded-md overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-[#18181B] text-zinc-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="text-left px-3 py-2.5 font-medium">Name</th>
                <th className="text-left px-3 py-2.5 font-medium">Phone</th>
                <th className="text-left px-3 py-2.5 font-medium">Email</th>
                <th className="text-left px-3 py-2.5 font-medium">GSTIN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#27272A]">
              {suppliers.length === 0 ? <tr><td colSpan={4} className="text-center py-8 text-zinc-500">No suppliers yet.</td></tr>
              : suppliers.map(s => (
                <tr key={s.id} className="hover:bg-[#18181B]/50" data-testid={`supplier-row-${s.name}`}>
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2 text-zinc-400">{s.phone || "—"}</td>
                  <td className="px-3 py-2 text-zinc-400">{s.email || "—"}</td>
                  <td className="px-3 py-2 font-mono text-zinc-400">{s.gstin || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {supOpen && <SupplierDialog onClose={() => setSupOpen(false)} onDone={() => { qc.invalidateQueries({ queryKey: ["suppliers"] }); setSupOpen(false); }} />}
      {poOpen && <PODialog onClose={() => setPoOpen(false)} onDone={() => { qc.invalidateQueries({ queryKey: ["po"] }); setPoOpen(false); }} suppliers={suppliers} products={products} locations={locations} />}
      {grnOpen && <GRNDialog po={grnOpen} onClose={() => setGrnOpen(null)} onDone={() => { qc.invalidateQueries({ queryKey: ["po"] }); qc.invalidateQueries({ queryKey: ["products"] }); setGrnOpen(null); }} />}
    </div>
  );
}

function SupplierDialog({ onClose, onDone }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", gstin: "", address: "" });
  const save = useMutation({
    mutationFn: async () => (await api.post("/procurement/suppliers", form)).data,
    onSuccess: () => { toast.success("Supplier added"); onDone(); },
    onError: (e) => toast.error(e?.response?.data?.detail || "Failed"),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-[#0C0C0F] border-[#27272A]">
        <DialogTitle className="font-display text-lg">New supplier</DialogTitle>
        <div className="space-y-3 mt-3">
          {["name", "phone", "email", "gstin", "address"].map(k => (
            <input key={k} data-testid={`sup-${k}`} placeholder={k.toUpperCase()} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              className="w-full h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-[13px] focus:border-blue-500 focus:outline-none" />
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-[13px]">Cancel</button>
          <button onClick={() => save.mutate()} data-testid="sup-save-btn" className="h-9 px-4 rounded-md bg-blue-500 hover:bg-blue-600 text-[13px] font-medium">Save</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PODialog({ onClose, onDone, suppliers, products, locations }) {
  const [supplier, setSupplier] = useState(suppliers[0]?.id || "");
  const [location, setLocation] = useState(locations[0]?.id || "");
  const [lines, setLines] = useState([]);
  const [pick, setPick] = useState("");

  const addLine = () => {
    const p = products.find(x => x.id === pick);
    if (!p) return;
    setLines([...lines, { product_id: p.id, name: p.name, sku: p.sku, qty: 1, cost: p.cost, received_qty: 0 }]);
    setPick("");
  };
  const upd = (i, k, v) => setLines(lines.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

  const save = useMutation({
    mutationFn: async () => (await api.post("/procurement/pos", { supplier_id: supplier, location_id: location, lines })).data,
    onSuccess: () => { toast.success("PO created"); onDone(); },
    onError: (e) => toast.error(e?.response?.data?.detail || "Failed"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-[#0C0C0F] border-[#27272A]">
        <DialogTitle className="font-display text-lg">New purchase order</DialogTitle>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <select data-testid="po-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} className="h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-[13px]">
            <option value="">Select supplier…</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={location} onChange={(e) => setLocation(e.target.value)} className="h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-[13px]">
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        <div className="mt-4 flex gap-2">
          <select data-testid="po-pick-product" value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1 h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-[13px]">
            <option value="">Add product…</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
          </select>
          <button onClick={addLine} data-testid="po-add-line" className="h-9 px-3 rounded-md bg-blue-500 hover:bg-blue-600 text-[13px] font-medium">Add</button>
        </div>

        <div className="mt-3 max-h-64 overflow-auto border border-[#27272A] rounded-md">
          {lines.length === 0 ? <div className="p-4 text-center text-zinc-500 text-[12px]">No lines. Add a product above.</div>
          : (
            <table className="w-full text-[12px]">
              <thead className="bg-[#18181B] text-zinc-500 uppercase text-[10px] tracking-wider">
                <tr><th className="text-left px-3 py-2">Product</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Cost</th><th className="px-3 py-2">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-[#27272A]">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5">{l.name}</td>
                    <td className="px-3 py-1.5"><input type="number" min="1" value={l.qty} onChange={(e) => upd(i, "qty", parseFloat(e.target.value) || 0)} className="w-16 h-7 px-2 bg-[#18181B] border border-[#27272A] rounded text-right tabular" /></td>
                    <td className="px-3 py-1.5"><input type="number" value={l.cost} onChange={(e) => upd(i, "cost", parseFloat(e.target.value) || 0)} className="w-20 h-7 px-2 bg-[#18181B] border border-[#27272A] rounded text-right tabular" /></td>
                    <td className="px-3 py-1.5 tabular text-right">{fmtCurrency(l.qty * l.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-sm text-zinc-400">Total: <span className="text-white font-medium tabular">{fmtCurrency(lines.reduce((s, l) => s + l.qty * l.cost, 0))}</span></div>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-[13px]">Cancel</button>
            <button onClick={() => save.mutate()} disabled={!supplier || lines.length === 0} data-testid="po-save-btn" className="h-9 px-4 rounded-md bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-[13px] font-medium">Create PO</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GRNDialog({ po, onClose, onDone }) {
  const [lines, setLines] = useState(po.lines.map(l => ({ product_id: l.product_id, qty: l.qty - (l.received_qty || 0), cost: l.cost, batch_no: "", expiry_date: "" })));
  const save = useMutation({
    mutationFn: async () => (await api.post("/procurement/grn", { po_id: po.id, lines: lines.filter(l => l.qty > 0) })).data,
    onSuccess: () => { toast.success("Goods received"); onDone(); },
    onError: (e) => toast.error(e?.response?.data?.detail || "Failed"),
  });
  const upd = (i, k, v) => setLines(lines.map((l, idx) => idx === i ? { ...l, [k]: v } : l));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-[#0C0C0F] border-[#27272A]">
        <DialogTitle className="font-display text-lg">Receive · {po.po_no}</DialogTitle>
        <div className="mt-3 border border-[#27272A] rounded-md max-h-80 overflow-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-[#18181B] text-zinc-500 uppercase text-[10px] tracking-wider">
              <tr><th className="text-left px-3 py-2">Product</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Cost</th><th className="px-3 py-2">Batch</th><th className="px-3 py-2">Expiry</th></tr>
            </thead>
            <tbody className="divide-y divide-[#27272A]">
              {po.lines.map((l, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5">{l.name}</td>
                  <td className="px-3 py-1.5"><input data-testid={`grn-qty-${i}`} type="number" min="0" value={lines[i].qty} onChange={(e) => upd(i, "qty", parseFloat(e.target.value) || 0)} className="w-16 h-7 px-2 bg-[#18181B] border border-[#27272A] rounded text-right tabular" /></td>
                  <td className="px-3 py-1.5"><input type="number" value={lines[i].cost} onChange={(e) => upd(i, "cost", parseFloat(e.target.value) || 0)} className="w-20 h-7 px-2 bg-[#18181B] border border-[#27272A] rounded text-right tabular" /></td>
                  <td className="px-3 py-1.5"><input value={lines[i].batch_no} onChange={(e) => upd(i, "batch_no", e.target.value)} className="w-24 h-7 px-2 bg-[#18181B] border border-[#27272A] rounded" /></td>
                  <td className="px-3 py-1.5"><input type="date" value={lines[i].expiry_date} onChange={(e) => upd(i, "expiry_date", e.target.value ? new Date(e.target.value).toISOString() : "")} className="w-32 h-7 px-2 bg-[#18181B] border border-[#27272A] rounded" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-[13px]">Cancel</button>
          <button onClick={() => save.mutate()} data-testid="grn-save-btn" className="h-9 px-4 rounded-md bg-blue-500 hover:bg-blue-600 text-[13px] font-medium">Receive</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
