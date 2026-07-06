import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { fmtCurrency, fmtNumber } from "../lib/fmt";
import { Plus, Search, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";

const emptyForm = { sku: "", barcode: "", name: "", category: "", unit: "pcs", tax_rate: 18, price: 0, cost: 0, reorder_level: 10, lead_time_days: 7, track_batch: false, image_url: "" };

export default function Inventory() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const { data: products = [], isLoading } = useQuery({ queryKey: ["products", q], queryFn: async () => (await api.get(`/inventory/products${q ? `?q=${encodeURIComponent(q)}` : ""}`)).data });
  const { data: alerts } = useQuery({ queryKey: ["alerts"], queryFn: async () => (await api.get("/inventory/alerts")).data });

  const save = useMutation({
    mutationFn: async () => editing ? (await api.put(`/inventory/products/${editing}`, form)).data : (await api.post("/inventory/products", form)).data,
    onSuccess: () => { toast.success(editing ? "Updated" : "Created"); qc.invalidateQueries({ queryKey: ["products"] }); setOpen(false); setEditing(null); setForm(emptyForm); },
    onError: (e) => toast.error(e?.response?.data?.detail || "Failed"),
  });

  const del = useMutation({
    mutationFn: async (pid) => (await api.delete(`/inventory/products/${pid}`)).data,
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["products"] }); },
  });

  const startEdit = (p) => {
    setEditing(p.id);
    setForm({ sku: p.sku, barcode: p.barcode || "", name: p.name, category: p.category || "", unit: p.unit, tax_rate: p.tax_rate, price: p.price, cost: p.cost, reorder_level: p.reorder_level, lead_time_days: p.lead_time_days, track_batch: p.track_batch, image_url: p.image_url || "" });
    setOpen(true);
  };

  const set = (k, v) => setForm({ ...form, [k]: v });

  return (
    <div className="p-6 space-y-4" data-testid="inventory-page">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-1">Catalog</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-zinc-500 mt-1">{products.length} products</p>
        </div>
        <button onClick={() => { setEditing(null); setForm(emptyForm); setOpen(true); }} data-testid="add-product-btn"
          className="h-9 px-3 rounded-md bg-blue-500 hover:bg-blue-600 text-white text-[13px] font-medium flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> New product
        </button>
      </div>

      {(alerts?.low_stock?.length > 0 || alerts?.expiring?.length > 0) && (
        <div className="flex flex-wrap gap-2" data-testid="alerts-banner">
          {alerts.low_stock.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[12px]">
              <AlertTriangle className="w-3 h-3" />
              {alerts.low_stock.length} products low on stock
            </div>
          )}
          {alerts.expiring.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20 text-[12px]">
              <AlertTriangle className="w-3 h-3" />
              {alerts.expiring.length} batches expiring in 60 days
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input data-testid="inventory-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SKU, name, barcode…"
            className="w-full h-9 pl-9 pr-3 rounded-md bg-[#18181B] border border-[#27272A] focus:border-blue-500 focus:outline-none text-[13px]" />
        </div>
      </div>

      <div className="surface rounded-md overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="bg-[#18181B] text-zinc-500 uppercase tracking-wider text-[10px] sticky top-0">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium">SKU</th>
              <th className="text-left px-3 py-2.5 font-medium">Name</th>
              <th className="text-left px-3 py-2.5 font-medium">Category</th>
              <th className="text-right px-3 py-2.5 font-medium">Price</th>
              <th className="text-right px-3 py-2.5 font-medium">Cost</th>
              <th className="text-right px-3 py-2.5 font-medium">Stock</th>
              <th className="text-center px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#27272A]">
            {isLoading ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-zinc-500">Loading…</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-zinc-500">No products. Add your first.</td></tr>
            ) : products.map((p) => {
              const low = p.stock <= p.reorder_level;
              const out = p.stock <= 0;
              return (
                <tr key={p.id} className="hover:bg-[#18181B]/60 cursor-pointer" onClick={() => startEdit(p)} data-testid={`product-row-${p.sku}`}>
                  <td className="px-3 py-2 font-mono text-zinc-400">{p.sku}</td>
                  <td className="px-3 py-2 text-zinc-100">{p.name}</td>
                  <td className="px-3 py-2 text-zinc-400">{p.category || "—"}</td>
                  <td className="px-3 py-2 text-right tabular">{fmtCurrency(p.price)}</td>
                  <td className="px-3 py-2 text-right tabular text-zinc-500">{fmtCurrency(p.cost)}</td>
                  <td className="px-3 py-2 text-right tabular">{fmtNumber(p.stock)}</td>
                  <td className="px-3 py-2 text-center">
                    {out ? <span className="inline-block px-2 py-0.5 rounded bg-red-500/10 text-red-400 text-[10px] uppercase tracking-wider">Out</span>
                     : low ? <span className="inline-block px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] uppercase tracking-wider">Low</span>
                     : <span className="inline-block px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] uppercase tracking-wider">OK</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete ${p.name}?`)) del.mutate(p.id); }} data-testid={`delete-${p.sku}`} className="text-zinc-600 hover:text-red-400 p-1"><X className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg bg-[#0C0C0F] border-[#27272A]">
          <DialogTitle className="font-display text-lg">{editing ? "Edit product" : "New product"}</DialogTitle>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label="SKU" value={form.sku} onChange={(v) => set("sku", v)} testId="pf-sku" />
            <Field label="Barcode" value={form.barcode} onChange={(v) => set("barcode", v)} testId="pf-barcode" />
            <Field label="Name" value={form.name} onChange={(v) => set("name", v)} full testId="pf-name" />
            <Field label="Category" value={form.category} onChange={(v) => set("category", v)} testId="pf-category" />
            <Field label="Unit" value={form.unit} onChange={(v) => set("unit", v)} testId="pf-unit" />
            <Field label="Price (₹)" type="number" value={form.price} onChange={(v) => set("price", parseFloat(v) || 0)} testId="pf-price" />
            <Field label="Cost (₹)" type="number" value={form.cost} onChange={(v) => set("cost", parseFloat(v) || 0)} testId="pf-cost" />
            <Field label="Tax %" type="number" value={form.tax_rate} onChange={(v) => set("tax_rate", parseFloat(v) || 0)} testId="pf-tax" />
            <Field label="Reorder level" type="number" value={form.reorder_level} onChange={(v) => set("reorder_level", parseInt(v) || 0)} testId="pf-reorder" />
            <Field label="Lead time (days)" type="number" value={form.lead_time_days} onChange={(v) => set("lead_time_days", parseInt(v) || 0)} testId="pf-lead" />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setOpen(false)} className="h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] hover:bg-[#27272A] text-[13px]">Cancel</button>
            <button onClick={() => save.mutate()} disabled={save.isPending} data-testid="pf-save-btn"
              className="h-9 px-4 rounded-md bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-[13px] font-medium">
              {editing ? "Update" : "Create"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", full, testId }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1 block">{label}</label>
      <input data-testid={testId} type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] focus:border-blue-500 focus:outline-none text-[13px]" />
    </div>
  );
}
