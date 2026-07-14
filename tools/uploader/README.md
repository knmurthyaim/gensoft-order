# GenSoft Uploader (Windows EXE)

Desktop tool to upload **customer**, **product**, and **outstanding** data from your billing software export files to the GenSoft cloud server.

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
3. Choose data type: Customers, Products, or Outstanding
4. Select `.xlsx` or `.json` file (see `samples/` folder)
5. Click **Upload to Cloud**

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
- `samples/` folder (optional — templates for your team)

## Command line (automation / scheduled task)

```bash
python gensoft_upload.py --cli ^
  --api https://gensoft-order.onrender.com ^
  --user vajra --password demo1234 ^
  --type outstanding ^
  --file "C:\exports\outstanding.xlsx"
```

Types: `customers`, `products`, `outstanding`

## API endpoints used

| Data | Excel | JSON |
|------|-------|------|
| Customers | `POST /api/parties/upload/excel` | `POST /api/parties/upload` |
| Products + stock | `POST /api/products/upload/excel` | `POST /api/products/upload` |
| Outstanding | `POST /api/outstanding/upload/excel` | `POST /api/outstanding/upload` |

All require `Authorization: Bearer <token>` from `POST /api/auth/login`.

## Sample files

See project folder `samples/`:
- `customers_sample.xlsx` / `.json`
- `products_stock_sample.xlsx` / `.json`
- `outstanding_sample.xlsx` / `.json`

Regenerate Excel samples: `python samples/generate_samples.py`

## Integrating your billing software

Export from your ERP in the same column layout as the sample Excel files, then upload via this tool or your own script calling the same API.
