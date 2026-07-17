# GenSoft Uploader (Windows EXE)

Desktop tool to upload **customer**, **product**, and **outstanding** data from your billing software export files to the GenSoft cloud server.

**Version 1.1** — template download, replace-all for Excel, longer timeout, non-blocking GUI.

## Quick start (Python)

```bash
cd tools/uploader
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python gensoft_upload.py
```

1. Enter cloud API URL: `https://gensoft-order.onrender.com`
2. Login with your distributor username/password (e.g. `vajra` / `demo1234`)
3. Click **Test login** (optional)
4. Choose data type, **Download template** if you need column layout
5. Select your `.xlsx` / `.json` and click **Upload to Cloud**

Settings are saved in `config.ini` beside the script/EXE.

## Build EXE

On Windows, double-click `build_exe.bat` or run:

```bash
cd tools/uploader
build_exe.bat
```

Output: `tools/uploader/dist/GenSoftUploader.exe`

Copy these next to the EXE for distribution:
- `config.example.ini` → rename to `config.ini` and edit credentials
- `samples/` folder (optional — or use **Download template**)

## Command line (automation / scheduled task)

```bash
python gensoft_upload.py --cli ^
  --api https://gensoft-order.onrender.com ^
  --user vajra --password demo1234 ^
  --type outstanding ^
  --file "C:\exports\outstanding.xlsx" ^
  --replace-all
```

Download a blank template:

```bash
python gensoft_upload.py --cli --download-template --type products --out products_template.xlsx ^
  --user vajra --password demo1234
```

Types: `customers`, `products`, `outstanding`

## API endpoints used

| Data | Excel | JSON | Template |
|------|-------|------|----------|
| Customers | `POST /api/parties/upload/excel?replace_all=` | `POST /api/parties/upload` | `GET /api/parties/upload/template` |
| Products + stock | `POST /api/products/upload/excel?replace_all=` | `POST /api/products/upload` | `GET /api/products/upload/template` |
| Outstanding | `POST /api/outstanding/upload/excel?replace_all=` | `POST /api/outstanding/upload` | `GET /api/outstanding/upload/template` |

All require `Authorization: Bearer <token>` from `POST /api/auth/login`.

Upload timeout is **30 minutes** (large stock files).

## Sample files

See project folder `samples/`:
- `customers_sample.xlsx` / `.json`
- `products_stock_sample.xlsx` / `.json`
- `outstanding_sample.xlsx` / `.json`

Regenerate Excel samples: `python samples/generate_samples.py`

## Integrating your billing software

Export from your ERP in the same column layout as the downloaded template, then upload via this tool or the web **Import** page.

**Outstanding:** `age` is optional — the server calculates it from `invoice_date`.
