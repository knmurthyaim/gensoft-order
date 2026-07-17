# GenSoft Auto Sync

Windows agent: export local billing data → Excel → upload to Render.
Supports **Visual FoxPro 6** via an export EXE/BAT (recommended), a folder of files, or optional SQL.

## For VFP6 (your case)

Your DBFs are not SQL. Use this flow:

1. Build / use a small VFP program (or EXE) that `COPY TO` these files into `C:\GenSoftExports\`:
   - `customers.txt` (or `.xlsx`)
   - `products_stock.txt` (or `.xlsx`)
   - `outstanding.txt` (or `.xlsx`)
2. Sample PRG/BAT: `tools/autosync/vfp/`
3. In Auto Sync choose **VFP / Run EXE**, browse to that EXE or BAT
4. **Install start with Windows**

Expected column headers are listed in `vfp/gensoft_export_order.prg`.

Auto Sync converts `.txt`/`.csv` → `.xlsx` and uploads to `https://gensoft-order.onrender.com`.

## Data source modes

| Mode | Behaviour |
|------|-----------|
| **VFP / Run EXE** | Runs your command, then uploads files from export folder |
| **Folder only** | Uploads existing files (no EXE) |
| **SQL Server** | Reads Lamrin SQL (only if you migrate off VFP) |

## Quick start

```bat
cd tools\autosync
copy config.example.ini config.ini
notepad config.ini
python gensoft_autosync.py
```

Or run `dist\GenSoftAutoSync.exe` after `build_exe.bat`.

## Build EXE

```bat
build_exe.bat
```

Ship `GenSoftAutoSync.exe` + `config.ini` + (optional) your VFP export EXE/BAT.
