# Distributor Ordering System (Pharma / FMCG)

A full-stack order management application for **distributor → retailer** ordering, modeled on platforms like ZennX. Built with a **Python (FastAPI)** backend and a **React (Vite)** frontend. It tracks distributors, retailers, sales reps, a product master with MRP/PTR/GST, batch-wise stock with expiry and schemes, and orders with automatic stock deduction, GST calculation, and retailer outstanding balances.

> Note: This project models the **data structure and workflow** of a pharma/FMCG distribution ordering system. It does not connect to or scrape any external site.

## Features

- **Dashboard** — orders, revenue, pending, total outstanding, retailer/distributor/product counts, low-stock and near-expiry alerts, plus recent orders.
- **Orders** — multi-line orders with batch selection, free goods, scheme discounts, automatic per-line GST, status workflow (`pending → confirmed → billed → dispatched → delivered`, or `cancelled` with auto restock + outstanding reversal), and order source (`web / app / callcenter / upload`).
- **Products** — product master: manufacturer, pack size, HSN, schedule, MRP, PTR rate, GST%, with aggregated stock.
- **Stock / Batches** — batch-wise inventory per distributor with batch number, expiry date, available qty, scheme, and rate.
- **Retailers** — pharmacies/stores with drug license, GSTIN, area, and live outstanding balance.
- **Distributors** — wholesale suppliers with GSTIN and drug license details.
- **Sales Reps** — field executives linked to a distributor.
- REST API with interactive docs at `/docs`.

## Data Model

```
distributors    (id, name, gstin, drug_license_no, address, area, phone, email)
retailers       (id, name, shop_name, drug_license_no, gstin, address, area,
                 phone, email, outstanding_balance)
sales_reps      (id, name, phone, email, distributor_id)
products        (id, name, manufacturer, pack_size, hsn_code, category, schedule,
                 mrp, ptr_rate, gst_pct)
stock_batches   (id, product_id, distributor_id, batch_no, expiry_date,
                 available_qty, scheme, ptr_rate, mrp)
orders          (id, retailer_id, distributor_id, sales_rep_id, status, source,
                 total_amount, gst_amount, notes, created_at)
order_items     (id, order_id, product_id, batch_id, qty, free_qty, rate,
                 scheme_discount, gst_pct, gst_amount, line_total)
```

## Tech Stack

| Layer    | Technology                          |
| -------- | ----------------------------------- |
| Backend  | Python, FastAPI, SQLAlchemy, SQLite |
| Frontend | React 18, Vite, React Router, Axios |

## Project Structure

```
Order/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app + dashboard/health endpoints
│   │   ├── database.py      # SQLAlchemy engine/session
│   │   ├── models.py        # ORM models
│   │   ├── schemas.py       # Pydantic schemas
│   │   ├── crud.py          # Business logic (pricing, GST, stock)
│   │   └── routers/         # distributors, retailers, salesreps,
│   │                        #   products, batches, orders
│   ├── seed.py              # Sample pharma data loader
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── api.js           # Axios API client
    │   ├── format.js        # INR currency / date helpers
    │   ├── App.jsx          # Layout + routes
    │   ├── components/      # Modal, CrudPage
    │   └── pages/           # Dashboard, Orders, NewOrder, Products,
    │                        #   Stock, Retailers, Distributors, SalesReps
    ├── index.html
    ├── vite.config.js       # Dev proxy /api -> :8000
    └── package.json
```

## Getting Started

### 1. Backend (http://localhost:8000)

```bash
cd backend
py -m venv venv
venv\Scripts\Activate.ps1         # Windows PowerShell
pip install -r requirements.txt
python seed.py                    # optional: load sample data
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs

### 2. Frontend (http://localhost:5173)

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies all `/api` requests to the backend on port 8000, so run both at the same time.

## API Overview

| Method   | Endpoint                    | Description                 |
| -------- | --------------------------- | --------------------------- |
| GET      | `/api/dashboard`            | Aggregate stats             |
| CRUD     | `/api/distributors`         | Distributors                |
| CRUD     | `/api/retailers`            | Retailers                   |
| CRUD     | `/api/sales-reps`           | Sales reps                  |
| CRUD     | `/api/products`             | Product master              |
| CRUD     | `/api/batches`              | Stock batches               |
| GET/POST | `/api/orders`               | List / create orders        |
| PATCH    | `/api/orders/{id}/status`   | Update order status         |
| DELETE   | `/api/orders/{id}`          | Delete order                |

(CRUD = GET list, GET by id, POST, PUT, DELETE.)

## Order Pricing Logic

For each line item:

```
taxable    = max(rate * qty - scheme_discount, 0)
gst_amount = taxable * gst_pct / 100
line_total = taxable + gst_amount
```

- `rate` defaults to the selected batch's PTR (falling back to the product PTR).
- Selecting a batch deducts `qty + free_qty` from `available_qty`.
- Creating an order increases the retailer's `outstanding_balance`; cancelling reverses it and restocks the batch.

## Notes

- The database is a local SQLite file (`backend/order_system.db`) created automatically on first run.
- CORS is open by default for easy local development; restrict `allow_origins` in `app/main.py` before deploying.
- If you change the models later, delete `order_system.db` and re-run `python seed.py` (SQLite create-all does not migrate column changes).
