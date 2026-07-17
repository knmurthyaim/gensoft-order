# GenSoft Sync — one software folder

Put **everything in one folder** (example `C:\GenSoftSync\`):

```
C:\GenSoftSync\
  GenSoftSync.exe      ← the app
  config.ini           ← settings
  run_vfp_export.bat   ← runs your VFP PRG
  customers.xlsx       ← created by PRG, deleted after upload OK
  products_stock.xlsx
  outstanding.xlsx
```

No separate export folder.

---

## What it does

1. Starts with Windows (optional)
2. Every **N minutes**:
   - Runs `run_vfp_export.bat` (or your EXE) in this folder
   - Uploads Excel files found in this folder
   - **Deletes each file only after that upload succeeds**

---

## Setup

### 1. Build

```bat
cd tools\autosync
build_exe.bat
```

### 2. Install on PC

Copy into one folder:

- `GenSoftSync.exe`
- `config.ini`
- `run_vfp_export.bat` (edit VFP6 + PRG paths inside)

### 3. Edit `config.ini`

```ini
[cloud]
username = your_login
password = your_password

[vfp]
run_command = run_vfp_export.bat

[sync]
folder = .
every_minutes = 60
delete_after_upload = true
```

`folder = .` means the same folder as the EXE.

### 4. Your VFP PRG

Write Excel into the **same software folder** (or `%1` / current directory if you pass it).

Expected names:

| File | Data |
|------|------|
| `customers.xlsx` | Parties |
| `products_stock.xlsx` | Products + stock |
| `outstanding.xlsx` | Outstanding |

### 5. Run

1. Double-click `GenSoftSync.exe`
2. **Save config** → **Run now** → **Start with Windows**

---

## Delete rule

| Upload | File in software folder |
|--------|-------------------------|
| Success | Deleted |
| Failed | Kept for next run |
