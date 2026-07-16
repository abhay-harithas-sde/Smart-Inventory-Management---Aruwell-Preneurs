import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../lib/api";
import { fmtCurrency } from "../lib/fmt";
import { payWithRazorpay } from "../lib/razorpay";
import { toast } from "sonner";
import { Plus, Minus, X, Search, ScanBarcode, Loader2, ReceiptText, IndianRupee } from "lucide-react";

export default function POS() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState("");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [lastReceipt, setLastReceipt] = useState(null);

  useEffect(() => { document.title = "POS — Smart Ledger"; }, []);

  const { data: products = [] } = useQuery({ queryKey: ["products-pos", q], queryFn: async () => (await api.get(`/inventory/products${q ? `?q=${encodeURIComponent(q)}` : ""}`)).data });
  const { data: locations = [] } = useQuery({ queryKey: ["locations"], queryFn: async () => (await api.get("/inventory/locations")).data });
  const [selectedLocationId, setSelectedLocationId] = useState(null);

  useEffect(() => {
    if (locations.length > 0 && !selectedLocationId) {
      setSelectedLocationId(locations[0]?.id);
    }
  }, [locations, selectedLocationId]);

  const checkout = useMutation({
    mutationFn: async (mode) => {
      const payload = {
        location_id: selectedLocationId,
        customer_name: customer,
        lines: cart.map(c => ({ product_id: c.id, name: c.name, sku: c.sku, qty: c.qty, price: c.price, tax_rate: c.tax_rate, line_total: 0 })),
        payment_mode: mode || paymentMode,
      };
      return (await api.post("/pos/sales", payload)).data;
    },
    onSuccess: (data) => {
      toast.success(`Sale ${data.invoice_no} completed`);
      setLastReceipt(data);
      setCart([]);
      setCustomer("");
      qc.invalidateQueries({ queryKey: ["products-pos"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
    onError: (e) => toast.error(e?.response?.data?.detail || "Checkout failed"),
  });

  const addToCart = (p) => {
    setCart((c) => {
      const existing = c.find(x => x.id === p.id);
      if (existing) return c.map(x => x.id === p.id ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { id: p.id, name: p.name, sku: p.sku, price: p.price, tax_rate: p.tax_rate, qty: 1 }];
    });
  };

  const updateQty = (id, delta) => setCart(c => c.map(x => x.id === id ? { ...x, qty: Math.max(1, x.qty + delta) } : x));
  const remove = (id) => setCart(c => c.filter(x => x.id !== id));

  const totals = useMemo(() => {
    let sub = 0, tax = 0;
    for (const l of cart) {
      const lineSub = l.qty * l.price;
      sub += lineSub;
      tax += lineSub * (l.tax_rate || 0) / 100;
    }
    return { sub, tax, total: sub + tax };
  }, [cart]);

  useEffect(() => {
    const handler = (e) => {
      if (e.code === "Space" && !e.target.matches("input,textarea")) {
        e.preventDefault();
        if (cart.length > 0 && !checkout.isPending) checkout.mutate(paymentMode);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cart, checkout, paymentMode]);

  return (
    <div className="h-[calc(100vh-3.5rem)] flex" data-testid="pos-page">
      {/* Products */}
      <div className="flex-1 flex flex-col border-r border-[#27272A] overflow-hidden">
        <div className="p-4 border-b border-[#27272A] flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <ScanBarcode className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              data-testid="pos-search"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && products.length > 0) {
                  addToCart(products[0]);
                  setQ("");
                }
              }}
              placeholder="Scan barcode or search product…"
              className="w-full h-10 pl-9 pr-3 rounded-md bg-[#18181B] border border-[#27272A] focus:border-blue-500 focus:outline-none text-sm"
            />
          </div>
          <span className="text-[11px] text-zinc-500">Press <kbd>Enter</kbd> to add</span>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
            {products.slice(0, 60).map((p) => (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                data-testid={`pos-product-${p.sku}`}
                className="surface surface-hover rounded-md p-3 text-left transition group"
              >
                <div className="text-[11px] text-zinc-500 font-mono">{p.sku}</div>
                <div className="text-[13px] font-medium mt-0.5 line-clamp-2 h-10">{p.name}</div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-[13px] tabular font-medium">{fmtCurrency(p.price)}</div>
                  <div className={`text-[10px] uppercase tracking-wider ${p.stock <= 0 ? "text-red-400" : p.stock <= p.reorder_level ? "text-amber-400" : "text-zinc-500"}`}>Stock {p.stock}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cart */}
      <aside className="w-96 flex flex-col bg-[#0C0C0F]">
        <div className="p-4 border-b border-[#27272A]">
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Active order</div>
          <div className="font-display text-xl font-semibold tracking-tight mt-0.5">Cart · {cart.length} items</div>
        </div>

        <div className="flex-1 overflow-auto" data-testid="pos-cart">
          {cart.length === 0 ? (
            <div className="p-8 text-center text-zinc-600 text-sm">
              <ReceiptText className="w-6 h-6 mx-auto mb-2 opacity-40" />
              No items yet. Scan or click products.
            </div>
          ) : (
            <div className="divide-y divide-[#27272A]">
              {cart.map((l) => (
                <div key={l.id} className="p-3 flex items-start gap-2" data-testid={`cart-line-${l.sku}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{l.name}</div>
                    <div className="text-[11px] text-zinc-500 font-mono">{l.sku} · {fmtCurrency(l.price)}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(l.id, -1)} className="w-6 h-6 rounded bg-[#18181B] hover:bg-[#27272A] flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                    <span className="w-6 text-center text-[13px] tabular">{l.qty}</span>
                    <button onClick={() => updateQty(l.id, 1)} data-testid={`cart-inc-${l.sku}`} className="w-6 h-6 rounded bg-[#18181B] hover:bg-[#27272A] flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                  </div>
                  <div className="text-[13px] tabular font-medium w-20 text-right">{fmtCurrency(l.qty * l.price)}</div>
                  <button onClick={() => remove(l.id)} className="text-zinc-600 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-[#27272A] space-y-3">
          {locations.length > 1 && (
            <select
              value={selectedLocationId || ""}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              data-testid="pos-location-select"
              className="w-full h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-[13px] focus:border-blue-500 focus:outline-none"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          )}
          <input
            data-testid="pos-customer"
            value={customer} onChange={(e) => setCustomer(e.target.value)}
            placeholder="Customer name (optional)"
            className="w-full h-9 px-3 rounded-md bg-[#18181B] border border-[#27272A] text-[13px] focus:border-blue-500 focus:outline-none"
          />

          <div className="grid grid-cols-4 gap-1">
            {["cash", "card", "upi", "split"].map(m => (
              <button key={m} onClick={() => setPaymentMode(m)} data-testid={`pos-pay-${m}`}
                className={`h-8 rounded-md text-[12px] uppercase tracking-wider transition ${paymentMode === m ? "bg-blue-500 text-white" : "bg-[#18181B] text-zinc-400 hover:bg-[#27272A]"}`}>
                {m}
              </button>
            ))}
          </div>

          <div className="text-[12px] space-y-1 pt-2 border-t border-[#27272A]">
            <div className="flex justify-between text-zinc-500"><span>Subtotal</span><span className="tabular">{fmtCurrency(totals.sub)}</span></div>
            <div className="flex justify-between text-zinc-500"><span>Tax (GST)</span><span className="tabular">{fmtCurrency(totals.tax)}</span></div>
            <div className="flex justify-between font-display text-lg font-semibold pt-1"><span>Total</span><span className="tabular" data-testid="pos-total">{fmtCurrency(totals.total)}</span></div>
          </div>

          <button
            onClick={() => checkout.mutate(paymentMode)}
            disabled={cart.length === 0 || checkout.isPending || !selectedLocationId}
            data-testid="pos-checkout-btn"
            className="w-full h-11 rounded-md bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-medium flex items-center justify-center gap-2"
          >
            {checkout.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Pay <kbd className="ml-2">Space</kbd>
          </button>

          <button
            onClick={async () => {
              if (cart.length === 0) return;
              const res = await payWithRazorpay({
                amountRupees: totals.total,
                receipt: `POS-${Date.now()}`,
                prefill: { name: customer || "Walk-in" },
                notes: { source: "pos" },
              });
              if (res.paid) {
                checkout.mutate("razorpay");
              }
            }}
            disabled={cart.length === 0 || !selectedLocationId}
            data-testid="pos-razorpay-btn"
            className="w-full h-10 rounded-md bg-[#18181B] border border-[#27272A] hover:border-blue-500/40 disabled:opacity-50 text-zinc-100 font-medium flex items-center justify-center gap-2 text-[13px] transition"
          >
            <IndianRupee className="w-3.5 h-3.5" /> Collect via Razorpay (UPI/Card)
          </button>
        </div>
      </aside>

      {lastReceipt && <ReceiptModal sale={lastReceipt} onClose={() => setLastReceipt(null)} />}
    </div>
  );
}

function ReceiptModal({ sale, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) return;
    const lines = sale.lines.map(l =>
      `<div style="display:flex;justify-content:space-between"><span>${l.qty}× ${l.name.slice(0, 22)}</span><span>₹${Number(l.line_total).toFixed(2)}</span></div>`
    ).join("");
    win.document.write(`
      <html><head><title>Receipt ${sale.invoice_no}</title>
      <style>body{font-family:monospace;font-size:12px;padding:16px;width:280px}
      .header{text-align:center;border-bottom:1px dashed #999;padding-bottom:8px;margin-bottom:8px}
      .total{display:flex;justify-content:space-between;font-weight:bold;border-top:1px dashed #999;padding-top:8px;margin-top:8px}
      .footer{text-align:center;font-size:10px;margin-top:12px}
      </style></head><body>
      <div class="header"><b>RECEIPT</b><br/><span>${sale.invoice_no}</span></div>
      ${lines}
      <div class="total"><span>TOTAL</span><span>₹${Number(sale.total).toFixed(2)}</span></div>
      <div class="footer">Paid via ${sale.payment_mode.toUpperCase()}<br/>Thank you!</div>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" data-testid="receipt-modal" onClick={onClose}>
      <div className="bg-white text-black rounded-md p-6 w-80 font-mono text-[12px]" onClick={(e) => e.stopPropagation()}>
        <div className="text-center border-b border-dashed border-zinc-400 pb-2 mb-2">
          <div className="font-bold text-sm">RECEIPT</div>
          <div className="text-[10px]">{sale.invoice_no}</div>
        </div>
        {sale.lines.map((l, i) => (
          <div key={i} className="flex justify-between">
            <span>{l.qty}× {l.name.slice(0, 18)}</span>
            <span>{fmtCurrency(l.line_total)}</span>
          </div>
        ))}
        <div className="border-t border-dashed border-zinc-400 mt-2 pt-2 flex justify-between font-bold">
          <span>TOTAL</span><span>{fmtCurrency(sale.total)}</span>
        </div>
        <div className="text-center text-[10px] mt-3">Paid via {sale.payment_mode.toUpperCase()}</div>
        <button onClick={handlePrint} className="w-full mt-3 h-8 bg-black text-white rounded text-[11px]">Print</button>
      </div>
    </div>
  );
}
