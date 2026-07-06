# ATH — AI-Augmented ERP Platform

## Original problem statement
Production-ready multi-tenant SaaS ERP for SMEs (retail, pharmacy, distributors) covering inventory, sales/POS, procurement, finance — with GPT-5.2 NLQ + demand forecasting.

## Architecture
- **Backend**: FastAPI + Motor (async MongoDB), JWT auth (pyjwt + bcrypt), emergentintegrations LlmChat for GPT-5.2.
- **Frontend**: React 19 + TanStack Query + Recharts + shadcn/ui + Tailwind. Dark, Linear-meets-QuickBooks aesthetic.
- **DB**: MongoDB; every collection carries `tenant_id`, compound indexes on startup.
- **AI**: GPT-5.2 (via EMERGENT_LLM_KEY) translates NL → sanitized Mongo aggregation with forced tenant_id `$match`.

## Personas
- **Owner**: full access, invites team, sees P&L
- **Manager**: products, POs, sales, expenses
- **Cashier**: POS only
- **Warehouse Staff**: GRN + stock adjust
- **Accountant**: expenses + finance

## Implemented (2026-02-07)
- Multi-tenant signup / login / me / RBAC + invite (P1)
- Inventory: products CRUD, alerts (low stock + expiry ≤60d), stock movements ledger, weighted-avg cost (P1)
- POS: barcode search, cart, GST checkout, refund, receipt modal, keyboard shortcuts (Space=pay, Ctrl+K=NLQ) (P1)
- Procurement: suppliers, PO, GRN → auto stock-in + batch/expiry capture (P1)
- Finance: expenses + P&L (revenue, COGS, gross, net, tax) (P1)
- Dashboard: 6 KPI cards + sales trend line + top products bar + category pie + AI insights (P1)
- AI: NLQ (GPT-5.2 → Mongo agg, tenant-scoped, sanitized), 30-day forecast + reorder qty, business narrative (P1)
- Demo seed: retail tenant with 20 SKUs, 45 days of sales history, 1 PO, 2 users (P1)

## Backlog
### P1 (next iteration)
- Multi-location transfers (currently single-location per tenant)
- Onboarding wizard for new signups
- Print-optimized invoice PDF (browser print only today)
- Multi-payment split-tender UI (backend accepts, UI just tags "split")

### P2
- Stripe/Razorpay subscription billing
- Resend transactional emails (invoice, invite)
- WhatsApp order notifications (Twilio)
- Advanced forecasting (Prophet / LSTM)
- Manufacturing / BOM module
- Double-entry accounting

## Credentials
See `/app/memory/test_credentials.md`. Demo: `owner@demo.ath` / `demo1234`.
