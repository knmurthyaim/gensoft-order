# GenSoft API Upload Samples

Sample JSON and Excel files for bulk upload from your billing software to the GenSoft cloud.

**Cloud server:** `https://gensoft-order.onrender.com`  
**Login:** distributor account (e.g. `vajra` / `demo1234`) → get token from `POST /api/auth/login`

**Windows uploader EXE:** see `tools/uploader/` — build with `build_exe.bat`

---

## 1. Products with stock

| Method | Endpoint |
|--------|----------|
| JSON | `POST /api/products/upload` |
| Excel | `POST /api/products/upload/excel` |
| Template | `GET /api/products/upload/template` |

**Files:** `products_stock_sample.json`, `products_stock_sample.xlsx`

**Excel columns:** product_code, name, manufacturer, pack_size, hsn_code, category, mrp, ptr_rate, pts_rate, gst_pct, batch_no, expiry_date (month/year e.g. `2027-06` or `06/2027`), available_qty, scheme, batch_mrp, batch_ptr_rate

One row per product **batch**. Repeat product_code/name for multiple batches of the same product.

```bash
curl -X POST https://gensoft-order.onrender.com/api/products/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @products_stock_sample.json
```

```bash
curl -X POST https://gensoft-order.onrender.com/api/products/upload/excel \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@products_stock_sample.xlsx"
```

---

## 2. Customer / party details

| Method | Endpoint |
|--------|----------|
| JSON | `POST /api/parties/upload` |
| Excel | `POST /api/parties/upload/excel` |
| Template | `GET /api/parties/upload/template` |

**Files:** `customers_sample.json`, `customers_sample.xlsx`

**Excel columns:** code, name, party_type, address, area, city, mobile, dl_no, gst_no, sales_rep_name, pricing_model

```bash
curl -X POST https://gensoft-order.onrender.com/api/parties/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @customers_sample.json
```

---

## 3. Outstanding bills

| Method | Endpoint |
|--------|----------|
| JSON | `POST /api/outstanding/upload` |
| Excel | `POST /api/outstanding/upload/excel` |
| Template | `GET /api/outstanding/upload/template` |

**Files:** `outstanding_sample.json`, `outstanding_sample.xlsx`

**Excel columns:** party_id, party_name, invoice_no, invoice_date, amount, paid, balance, age, discount

- `balance` and `age` are optional (auto-calculated if omitted).
- **Age** is calculated from `invoice_date` on the server (uploaded age is ignored when date is present).
- `replace_all: true` (JSON body) or `?replace_all=true` (Excel) replaces all existing bills for your account.

**`invoice_date` formats (important):**

| How to enter in Excel | Example |
|----------------------|---------|
| Excel **Date** cell (recommended) | Format cells → Date → `DD-MM-YYYY` |
| Text `DD-MM-YYYY` | `25-05-2026` |
| Text `DD/MM/YYYY` | `25/05/2026` |
| Text `YYYY-MM-DD` | `2026-05-25` |

Avoid US style `MM/DD/YYYY` (e.g. `05/25/2026`) — day and month get swapped.  
If the date shows as a number like `45802`, format that column as **Date** before upload (or leave it — the API now reads Excel serial dates too).

```bash
curl -X POST https://gensoft-order.onrender.com/api/outstanding/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @outstanding_sample.json
```

---

## Workflow from your software

1. Export customers, products, and outstanding from your billing/ERP in Excel (match column names above).
2. Use **GenSoft Uploader** (`tools/uploader/dist/GenSoftUploader.exe`) or the web **Import** page.
3. Data is stored in your distributor account on the cloud — retailers see it after connection.

## Notes

- All uploads are scoped to the logged-in distributor account.
- `replace_all: false` (default) upserts by product code, party code, or invoice+party.
- Outstanding date: prefer Excel Date cells or `DD-MM-YYYY` / `YYYY-MM-DD` text.
- Stock expiry: month/year only (`2027-06` or `06/2027`).

Regenerate Excel samples: `python generate_samples.py` (from this folder).
