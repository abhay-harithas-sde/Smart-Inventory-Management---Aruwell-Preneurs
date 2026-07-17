import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { fmtCurrency, fmtNumber } from "../lib/fmt";
import { Plus, Search, AlertTriangle, X, Upload, Loader2, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "../components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../components/ui/alert-dialog";
import { uploadImageSigned } from "../lib/upload";

const emptyForm = { sku: "", barcode: "", name: "", category: "", unit: "pcs", tax_rate: 18, price: 0, cost: 0, reorder_level: 10, lead_time_days: 7, track_batch: false, image_url: "" };

// CSV column → ProductIn field mapping (case-insensitive header matching)
const CSV_FIELD_MAP = {
  sku: "sku", barcode: "barcode", name: "name", category: "category",
  unit: "unit", tax_rate: "tax_rate", "tax rate": "tax_rate", "tax%": "tax_rate",
  price: "price", cost: "cost", reorder_level: "reorder_level", "reorder level": "reorder_level",
  lead_time_days: "lead_time_days", "lead time days": "lead_time_days",
  track_batch: "track_batch", "track batch": "track_batch", image_url: "image_url",
};
const NUM_FIELDS = new Set(["tax_rate", "price", "cost", "reorder_level", "lead_time_days"]);
const BOOL_FIELDS = new Set(["track_batch"]);

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (lines.length < 2) return { rows: [], errors: ["CSV must have at least a header row and one data row"] };

  // Simple CSV parser — handles quoted fields
  const parseRow = (line) => {
    const fields = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { fields.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    fields.push(cur.trim());
    return fields;
  };

  const headers = parseRow(lines[0]).map((h) => h.toLowerCase().trim());
  const fieldKeys = headers.map((h) => CSV_FIELD_MAP[h] || null);

  const rows = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseRow(lines[i]);
    const row = { sku: "", name: "", barcode: "", category: "", unit: "pcs", tax_rate: 18, price: 0, cost: 0, reorder_level: 10, lead_time_days: 7, track_batch: false, image_url: "" };
    fieldKeys.forEach((key, idx) => {
      if (!key) return;
      const raw = vals[idx] ?? "";
      if (NUM_FIELDS.has(key)) row[key] = parseFloat(raw) || 0;
      else if (BOOL_FIELDS.has(key)) row[key] = ["true", "1", "yes"].includes(raw.toLowerCase());
      else row[key] = raw;
    });
    if (!row.sku) { errors.push(`Row ${i + 1}: missing SKU — skipped`); continue; }
    if (!row.name) { errors.push(`Row ${i + 1}: missing Name — skipped`); continue; }
    rows.push(row);
  }

  return { rows, errors };
}

export default function Inventory() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [csvPreview, setCsvPreview] = useState(null); // { rows, errors } | null
  const [csvImporting, setCsvImporting] = useState(false);

  React.useEffect(() => { document.title = "Inventory — Smart Ledger"; }, []);

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

  const handleCSVFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const { rows, errors } = parseCSV(e.target.result);
      if (rows.length === 0 && errors.length > 0) {
        toast.error("No valid rows found in CSV");
        return;
      }
      setCsvPreview({ rows, errors, fileName: file.name });
    };
    reader.readAsText(file);
  };

  const runBulkImport = async () => {
    if (!csvPreview?.rows?.length) return;
    setCsvImporting(true);
    try {
      const res = (await api.post("/inventory/products/bulk", csvPreview.rows)).data;
      toast.success(`Imported ${res.created} product${res.created !== 1 ? "s" : ""}${res.skipped.length ? ` (${res.skipped.length} duplicate SKU${res.skipped.length !== 1 ? "s" : ""} skipped)` : ""}`);
      qc.invalidateQueries({ queryKey: ["products"] });
      setCsvPreview(null);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Bulk import failed");
    } finally {
      setCsvImporting(false);
    }
  };

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
                    <button onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: p.id, name: p.name }); }} data-testid={`delete-${p.sku}`} className="text-zinc-600 hover:text-red-400 p-1"><X className="w-3.5 h-3.5" /></button>
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

          <ImageUploader value={form.image_url} onChange={(url) => set("image_url", url)} onCSV={handleCSVFile} />

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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="bg-[#0C0C0F] border-[#27272A]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete <span className="text-zinc-200 font-medium">{deleteTarget?.name}</span>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#18181B] border-[#27272A] text-zinc-300 hover:bg-[#27272A]" onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 hover:bg-red-600 text-white" onClick={() => { del.mutate(deleteTarget.id); setDeleteTarget(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* CSV Import Preview Dialog */}
      <Dialog open={!!csvPreview} onOpenChange={(v) => { if (!v) setCsvPreview(null); }}>
        <DialogContent className="max-w-3xl bg-[#0C0C0F] border-[#27272A] max-h-[80vh] flex flex-col">
          <DialogTitle className="font-display text-lg flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-blue-400" />
            CSV Import Preview
          </DialogTitle>

          {csvPreview && (
            <>
              <div className="text-[12px] text-zinc-400 mb-2">
                <span className="text-zinc-200 font-medium">{csvPreview.fileName}</span>
                {" — "}
                <span className="text-emerald-400">{csvPreview.rows.length} valid row{csvPreview.rows.length !== 1 ? "s" : ""}</span>
                {csvPreview.errors.length > 0 && (
                  <span className="text-amber-400 ml-2">{csvPreview.errors.length} row{csvPreview.errors.length !== 1 ? "s" : ""} skipped</span>
                )}
              </div>

              {csvPreview.errors.length > 0 && (
                <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 mb-3">
                  <div className="flex items-center gap-1.5 text-amber-400 text-[11px] font-medium mb-1.5">
                    <AlertCircle className="w-3 h-3" /> Parse warnings
                  </div>
                  <ul className="space-y-0.5">
                    {csvPreview.errors.map((e, i) => (
                      <li key={i} className="text-[11px] text-amber-300/80">{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex-1 overflow-auto rounded-md border border-[#27272A]">
                <table className="w-full text-[11px]">
                  <thead className="bg-[#18181B] text-zinc-500 uppercase tracking-wider text-[10px] sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">SKU</th>
                      <th className="text-left px-3 py-2 font-medium">Name</th>
                      <th className="text-left px-3 py-2 font-medium">Category</th>
                      <th className="text-left px-3 py-2 font-medium">Unit</th>
                      <th className="text-right px-3 py-2 font-medium">Price</th>
                      <th className="text-right px-3 py-2 font-medium">Cost</th>
                      <th className="text-right px-3 py-2 font-medium">Tax %</th>
                      <th className="text-right px-3 py-2 font-medium">Reorder</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#27272A]">
                    {csvPreview.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-[#18181B]/60">
                        <td className="px-3 py-1.5 font-mono text-zinc-300">{row.sku}</td>
                        <td className="px-3 py-1.5 text-zinc-200">{row.name}</td>
                        <td className="px-3 py-1.5 text-zinc-400">{row.category || "—"}</td>
                        <td className="px-3 py-1.5 text-zinc-400">{row.unit}</td>
                        <td className="px-3 py-1.5 text-right tabular">{fmtCurrency(row.price)}</td>
                        <td className="px-3 py-1.5 text-right tabular text-zinc-500">{fmtCurrency(row.cost)}</td>
                        <td className="px-3 py-1.5 text-right tabular">{row.tax_rate}%</td>
                        <td className="px-3 py-1.5 text-right tabular">{row.reorder_level}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2 mt-4 flex-shrink-0">
                <button onClick={() => setCsvPreview(null)} className="h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] hover:bg-[#27272A] text-[13px]">Cancel</button>
                <button onClick={runBulkImport} disabled={csvImporting || csvPreview.rows.length === 0}
                  className="h-9 px-4 rounded-md bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-[13px] font-medium flex items-center gap-2">
                  {csvImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {csvImporting ? "Importing…" : `Import ${csvPreview.rows.length} product${csvPreview.rows.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </>
          )}
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

function ImageUploader({ value, onChange, onCSV }) {
  const [uploading, setUploading] = useState(false);
  const csvRef = useRef(null);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImageSigned(file, "products");
      onChange(url);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err?.message || "Upload failed");
    } finally { setUploading(false); }
  };

  const onCSVPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onCSV(file);
    // reset input so same file can be re-selected
    e.target.value = "";
  };

  return (
    <div className="mt-3">
      <label className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1 block">Product image</label>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-16 h-16 rounded-md bg-[#18181B] border border-[#27272A] overflow-hidden flex items-center justify-center">
          {value ? <img src={value} alt="" className="w-full h-full object-cover" /> : <Upload className="w-4 h-4 text-zinc-600" />}
        </div>
        <label className="h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] hover:bg-[#27272A] text-[12px] font-medium cursor-pointer flex items-center gap-2" data-testid="pf-image-upload">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {uploading ? "Uploading…" : (value ? "Replace" : "Upload")}
          <input type="file" accept="image/*" className="hidden" onChange={onPick} disabled={uploading} />
        </label>
        {value && (
          <button onClick={() => onChange("")} className="text-[11px] text-zinc-500 hover:text-red-400">Remove</button>
        )}

        {/* CSV bulk import button */}
        <div className="flex items-center gap-1.5 ml-auto">
          <label
            className="h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] hover:bg-[#27272A] text-[12px] font-medium cursor-pointer flex items-center gap-2 text-blue-400 border-blue-500/30"
            title="Import multiple products from a CSV file"
            data-testid="pf-csv-upload"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Import CSV
            <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onCSVPick} />
          </label>
        </div>
      </div>
      <p className="text-[10px] text-zinc-600 mt-1.5">
        CSV columns: <span className="font-mono">sku, name, barcode, category, unit, price, cost, tax_rate, reorder_level, lead_time_days</span>
      </p>
    </div>
  );
}
