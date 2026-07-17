"""
GenSoft Data Uploader — upload customers, products, and outstanding bills to the cloud API.

Usage:
  python gensoft_upload.py              # GUI
  python gensoft_upload.py --cli ...    # command line (for automation)

Build Windows EXE:
  pip install -r requirements.txt
  pyinstaller --onefile --windowed --name GenSoftUploader gensoft_upload.py
"""

from __future__ import annotations

import argparse
import configparser
import json
import os
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext, ttk

import requests

APP_NAME = "GenSoft Data Uploader"
VERSION = "1.1.0"
DEFAULT_API = "https://gensoft-order.onrender.com"
# Large stock sheets can take many minutes on Render cold starts.
UPLOAD_TIMEOUT_SEC = 1800
LOGIN_TIMEOUT_SEC = 120

UPLOAD_TYPES = {
    "customers": {
        "label": "Customers / Parties",
        "json_path": "/api/parties/upload",
        "excel_path": "/api/parties/upload/excel",
        "template_path": "/api/parties/upload/template",
        "template_name": "gensoft_customers_template.xlsx",
    },
    "products": {
        "label": "Products + Stock",
        "json_path": "/api/products/upload",
        "excel_path": "/api/products/upload/excel",
        "template_path": "/api/products/upload/template",
        "template_name": "gensoft_products_stock_template.xlsx",
    },
    "outstanding": {
        "label": "Outstanding Bills",
        "json_path": "/api/outstanding/upload",
        "excel_path": "/api/outstanding/upload/excel",
        "template_path": "/api/outstanding/upload/template",
        "template_name": "gensoft_outstanding_template.xlsx",
    },
}


def app_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent


def config_path() -> Path:
    return app_dir() / "config.ini"


def load_config() -> configparser.ConfigParser:
    cfg = configparser.ConfigParser()
    path = config_path()
    if path.exists():
        cfg.read(path, encoding="utf-8")
    if "server" not in cfg:
        cfg["server"] = {}
    if "login" not in cfg:
        cfg["login"] = {}
    return cfg


def save_config(api_url: str, username: str, password: str) -> None:
    cfg = configparser.ConfigParser()
    cfg["server"] = {"api_url": api_url.rstrip("/")}
    cfg["login"] = {"username": username, "password": password}
    with open(config_path(), "w", encoding="utf-8") as f:
        cfg.write(f)


def normalize_api_url(url: str) -> str:
    url = url.strip().rstrip("/")
    if not url:
        return DEFAULT_API
    if url.endswith("/api"):
        return url[:-4]
    return url


def _error_detail(resp: requests.Response) -> str:
    detail = resp.text
    try:
        body = resp.json()
        detail = body.get("detail", detail)
        if isinstance(detail, list):
            detail = "; ".join(
                str(x.get("msg", x) if isinstance(x, dict) else x) for x in detail
            )
    except Exception:
        pass
    return detail


def login(api_base: str, username: str, password: str) -> str:
    resp = requests.post(
        f"{api_base}/api/auth/login",
        json={"username": username, "password": password},
        timeout=LOGIN_TIMEOUT_SEC,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Login failed ({resp.status_code}): {_error_detail(resp)}")
    data = resp.json()
    token = data.get("access_token") or data.get("token")
    if not token:
        raise RuntimeError("Login succeeded but no token in response.")
    return token


def download_template(
    api_base: str,
    token: str,
    upload_type: str,
    dest: Path,
) -> Path:
    if upload_type not in UPLOAD_TYPES:
        raise ValueError(f"Unknown upload type: {upload_type}")
    meta = UPLOAD_TYPES[upload_type]
    url = f"{api_base}{meta['template_path']}"
    resp = requests.get(
        url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=LOGIN_TIMEOUT_SEC,
    )
    if resp.status_code != 200:
        raise RuntimeError(
            f"Template download failed ({resp.status_code}): {_error_detail(resp)}"
        )
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(resp.content)
    return dest


def upload_file(
    api_base: str,
    token: str,
    upload_type: str,
    file_path: Path,
    replace_all: bool = False,
    timeout: int = UPLOAD_TIMEOUT_SEC,
    progress_cb=None,
) -> dict:
    if upload_type not in UPLOAD_TYPES:
        raise ValueError(f"Unknown upload type: {upload_type}")

    meta = UPLOAD_TYPES[upload_type]
    headers = {"Authorization": f"Bearer {token}"}
    suffix = file_path.suffix.lower()
    size_mb = file_path.stat().st_size / (1024 * 1024)

    if progress_cb:
        progress_cb(f"Preparing {file_path.name} ({size_mb:.1f} MB)…")

    upload_path = file_path
    upload_name = file_path.name
    if suffix == ".xls":
        # Cloud API expects .xlsx — convert legacy Excel first
        try:
            from export_files import xls_to_xlsx
        except ImportError:
            # when running from tools/uploader, look beside autosync
            import sys as _sys
            from pathlib import Path as _Path

            sibling = _Path(__file__).resolve().parent.parent / "autosync"
            if str(sibling) not in _sys.path:
                _sys.path.insert(0, str(sibling))
            from export_files import xls_to_xlsx

        converted = file_path.with_suffix(".xlsx")
        if progress_cb:
            progress_cb(f"Converting {file_path.name} → {converted.name}…")
        xls_to_xlsx(file_path, converted)
        upload_path = converted
        upload_name = converted.name
        suffix = ".xlsx"

    if suffix == ".xlsx":
        url = f"{api_base}{meta['excel_path']}"
        if replace_all:
            url = f"{url}?replace_all=true"
        with open(upload_path, "rb") as f:
            if progress_cb:
                progress_cb("Uploading Excel to cloud (please wait)…")
            resp = requests.post(
                url,
                headers=headers,
                files={
                    "file": (
                        upload_name,
                        f,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                },
                timeout=timeout,
            )
    elif suffix == ".json":
        url = f"{api_base}{meta['json_path']}"
        with open(file_path, encoding="utf-8") as f:
            payload = json.load(f)
        if isinstance(payload, dict):
            payload["replace_all"] = replace_all
        elif isinstance(payload, list):
            # wrap list payloads to include replace_all when API expects object
            key = {
                "customers": "customers",
                "products": "products",
                "outstanding": "bills",
            }.get(upload_type, "items")
            payload = {key: payload, "replace_all": replace_all}
        if progress_cb:
            progress_cb("Uploading JSON to cloud (please wait)…")
        resp = requests.post(
            url,
            headers={**headers, "Content-Type": "application/json"},
            json=payload,
            timeout=timeout,
        )
    else:
        raise ValueError("File must be .xlsx, .xls, or .json")

    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Upload failed ({resp.status_code}): {_error_detail(resp)}")

    return resp.json()


def run_upload(
    api_url: str,
    username: str,
    password: str,
    upload_type: str,
    file_path: str | Path,
    replace_all: bool = False,
    progress_cb=None,
) -> dict:
    api_base = normalize_api_url(api_url)
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    if progress_cb:
        progress_cb("Logging in…")
    token = login(api_base, username, password)
    return upload_file(
        api_base,
        token,
        upload_type,
        path,
        replace_all,
        progress_cb=progress_cb,
    )


def format_result(result: dict) -> str:
    lines = ["Upload completed successfully.", ""]
    for key in (
        "created",
        "updated",
        "uploaded",
        "skipped",
        "failed",
        "errors",
        "total",
    ):
        if key not in result:
            continue
        val = result[key]
        if key == "errors" and isinstance(val, list):
            lines.append(f"  errors: {len(val)}")
        else:
            lines.append(f"  {key}: {val}")
    err_list = result.get("errors")
    if isinstance(err_list, list) and err_list:
        lines.append("")
        lines.append("Error details (first 25):")
        for msg in err_list[:25]:
            lines.append(f"  - {msg}")
        if len(err_list) > 25:
            lines.append(f"  ... and {len(err_list) - 25} more")
    if result.get("messages"):
        lines.append("")
        lines.append("Messages:")
        for msg in result["messages"][:20]:
            lines.append(f"  - {msg}")
        if len(result["messages"]) > 20:
            lines.append(f"  ... and {len(result['messages']) - 20} more")
    lines.append("")
    lines.append(json.dumps(result, indent=2, default=str))
    return "\n".join(lines)


class UploaderApp:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title(f"{APP_NAME} v{VERSION}")
        self.root.geometry("680x580")
        self.root.minsize(540, 460)
        self._busy = False

        cfg = load_config()
        self.api_var = tk.StringVar(
            value=cfg.get("server", "api_url", fallback=DEFAULT_API)
        )
        self.user_var = tk.StringVar(
            value=cfg.get("login", "username", fallback="")
        )
        self.pass_var = tk.StringVar(
            value=cfg.get("login", "password", fallback="")
        )
        self.type_var = tk.StringVar(value="customers")
        self.file_var = tk.StringVar(value="")
        self.replace_var = tk.BooleanVar(value=False)
        self.status_var = tk.StringVar(value="Ready")

        self._build_ui()

    def _build_ui(self) -> None:
        pad = {"padx": 10, "pady": 4}
        frm = ttk.Frame(self.root, padding=10)
        frm.pack(fill=tk.BOTH, expand=True)

        ttk.Label(frm, text=APP_NAME, font=("Segoe UI", 14, "bold")).grid(
            row=0, column=0, columnspan=3, sticky="w", pady=(0, 2)
        )
        ttk.Label(
            frm,
            text="Upload Excel/JSON from your billing software to GenSoft cloud",
            font=("Segoe UI", 9),
        ).grid(row=1, column=0, columnspan=3, sticky="w", pady=(0, 8))

        ttk.Label(frm, text="API URL:").grid(row=2, column=0, sticky="w", **pad)
        ttk.Entry(frm, textvariable=self.api_var, width=50).grid(
            row=2, column=1, columnspan=2, sticky="ew", **pad
        )

        ttk.Label(frm, text="Username:").grid(row=3, column=0, sticky="w", **pad)
        ttk.Entry(frm, textvariable=self.user_var, width=30).grid(
            row=3, column=1, columnspan=2, sticky="w", **pad
        )

        ttk.Label(frm, text="Password:").grid(row=4, column=0, sticky="w", **pad)
        ttk.Entry(frm, textvariable=self.pass_var, show="*", width=30).grid(
            row=4, column=1, columnspan=2, sticky="w", **pad
        )

        ttk.Label(frm, text="Data type:").grid(row=5, column=0, sticky="w", **pad)
        labels = [UPLOAD_TYPES[k]["label"] for k in UPLOAD_TYPES]
        self._label_to_key = {UPLOAD_TYPES[k]["label"]: k for k in UPLOAD_TYPES}
        self.type_combo = ttk.Combobox(
            frm,
            values=labels,
            state="readonly",
            width=32,
        )
        self.type_combo.set(UPLOAD_TYPES["customers"]["label"])
        self.type_combo.grid(row=5, column=1, sticky="w", **pad)
        self.type_combo.bind("<<ComboboxSelected>>", self._on_type_change)

        ttk.Label(frm, text="File (.xlsx / .xls / .json):").grid(
            row=6, column=0, sticky="w", **pad
        )
        ttk.Entry(frm, textvariable=self.file_var, width=40).grid(
            row=6, column=1, sticky="ew", **pad
        )
        ttk.Button(frm, text="Browse…", command=self._browse).grid(
            row=6, column=2, sticky="w", **pad
        )

        ttk.Checkbutton(
            frm,
            text="Replace all existing records for this type (Excel + JSON)",
            variable=self.replace_var,
        ).grid(row=7, column=1, columnspan=2, sticky="w", **pad)

        btn_row = ttk.Frame(frm)
        btn_row.grid(row=8, column=0, columnspan=3, sticky="ew", pady=8)
        self.upload_btn = ttk.Button(
            btn_row, text="Upload to Cloud", command=self._upload
        )
        self.upload_btn.pack(side=tk.LEFT, padx=4)
        ttk.Button(btn_row, text="Test login", command=self._test_login).pack(
            side=tk.LEFT, padx=4
        )
        ttk.Button(
            btn_row, text="Download template", command=self._download_template
        ).pack(side=tk.LEFT, padx=4)
        ttk.Button(btn_row, text="Save login", command=self._save_login).pack(
            side=tk.LEFT, padx=4
        )
        ttk.Button(
            btn_row, text="Open samples folder", command=self._open_samples
        ).pack(side=tk.LEFT, padx=4)

        ttk.Label(frm, textvariable=self.status_var).grid(
            row=9, column=0, columnspan=3, sticky="w", **pad
        )

        ttk.Label(frm, text="Log:").grid(row=10, column=0, sticky="nw", **pad)
        self.log = scrolledtext.ScrolledText(
            frm, height=14, wrap=tk.WORD, font=("Consolas", 9)
        )
        self.log.grid(row=10, column=1, columnspan=2, sticky="nsew", **pad)

        frm.columnconfigure(1, weight=1)
        frm.rowconfigure(10, weight=1)

        self._log(
            f"{APP_NAME} v{VERSION} ready.\n"
            f"Cloud API: {DEFAULT_API}\n"
            "Tip: Download template for the correct Excel columns.\n"
            "Outstanding age is calculated from invoice date on the server.\n"
        )

    def _selected_type(self) -> str:
        label = self.type_combo.get()
        return self._label_to_key.get(label, "customers")

    def _on_type_change(self, _event=None) -> None:
        key = self._selected_type()
        self.type_var.set(key)
        self.status_var.set(f"Selected: {UPLOAD_TYPES[key]['label']}")

    def _browse(self) -> None:
        path = filedialog.askopenfilename(
            title="Select data file",
            filetypes=[
                ("Excel", "*.xlsx;*.xls"),
                ("JSON", "*.json"),
                ("All", "*.*"),
            ],
        )
        if path:
            self.file_var.set(path)

    def _log(self, text: str) -> None:
        self.log.insert(tk.END, text + ("" if text.endswith("\n") else "\n"))
        self.log.see(tk.END)

    def _set_busy(self, busy: bool, status: str = "") -> None:
        self._busy = busy
        state = tk.DISABLED if busy else tk.NORMAL
        self.upload_btn.config(state=state)
        if status:
            self.status_var.set(status)
        elif not busy:
            self.status_var.set("Ready")

    def _save_login(self) -> None:
        save_config(self.api_var.get(), self.user_var.get(), self.pass_var.get())
        messagebox.showinfo("Saved", f"Settings saved to:\n{config_path()}")

    def _open_samples(self) -> None:
        samples = app_dir() / "samples"
        if not samples.exists():
            samples = app_dir().parent.parent / "samples"
        if not samples.exists():
            samples = Path.cwd() / "samples"
        if samples.exists():
            os.startfile(samples)
        else:
            messagebox.showwarning(
                "Not found",
                "samples folder not found. Use Download template instead.",
            )

    def _creds(self):
        api = self.api_var.get().strip()
        user = self.user_var.get().strip()
        pwd = self.pass_var.get()
        if not api or not user or not pwd:
            messagebox.showerror(
                "Missing fields",
                "API URL, username, and password are required.",
            )
            return None
        return api, user, pwd

    def _test_login(self) -> None:
        creds = self._creds()
        if not creds or self._busy:
            return
        api, user, pwd = creds

        def work():
            try:
                self.root.after(
                    0, lambda: self._set_busy(True, "Testing login…")
                )
                token = login(normalize_api_url(api), user, pwd)
                save_config(api, user, pwd)
                self.root.after(
                    0,
                    lambda: (
                        self._log(f"Login OK. Token received ({len(token)} chars)."),
                        messagebox.showinfo("Login OK", "Connected to GenSoft API."),
                        self._set_busy(False),
                    ),
                )
            except Exception as exc:
                msg = str(exc)
                self.root.after(
                    0,
                    lambda: (
                        self._log(f"ERROR: {msg}"),
                        messagebox.showerror("Login failed", msg),
                        self._set_busy(False),
                    ),
                )

        threading.Thread(target=work, daemon=True).start()

    def _download_template(self) -> None:
        creds = self._creds()
        if not creds or self._busy:
            return
        api, user, pwd = creds
        utype = self._selected_type()
        meta = UPLOAD_TYPES[utype]
        dest = filedialog.asksaveasfilename(
            title="Save Excel template",
            defaultextension=".xlsx",
            initialfile=meta["template_name"],
            filetypes=[("Excel", "*.xlsx")],
        )
        if not dest:
            return

        def work():
            try:
                self.root.after(
                    0, lambda: self._set_busy(True, "Downloading template…")
                )
                api_base = normalize_api_url(api)
                token = login(api_base, user, pwd)
                path = download_template(api_base, token, utype, Path(dest))
                self.root.after(
                    0,
                    lambda: (
                        self._log(f"Template saved: {path}"),
                        messagebox.showinfo(
                            "Template saved",
                            f"Saved to:\n{path}\n\nFill this sheet from your ERP export.",
                        ),
                        self._set_busy(False),
                    ),
                )
            except Exception as exc:
                msg = str(exc)
                self.root.after(
                    0,
                    lambda: (
                        self._log(f"ERROR: {msg}"),
                        messagebox.showerror("Template failed", msg),
                        self._set_busy(False),
                    ),
                )

        threading.Thread(target=work, daemon=True).start()

    def _upload(self) -> None:
        if self._busy:
            return
        creds = self._creds()
        if not creds:
            return
        api, user, pwd = creds
        fpath = self.file_var.get().strip()
        utype = self._selected_type()
        replace_all = bool(self.replace_var.get())

        if not fpath:
            messagebox.showerror(
                "Missing file", "Please select an Excel or JSON file."
            )
            return
        if replace_all:
            ok = messagebox.askyesno(
                "Replace all?",
                "This will DELETE all existing records of this type for your "
                "account before uploading the file.\n\nContinue?",
            )
            if not ok:
                return

        self._log(
            f"\n--- Uploading {utype} from {Path(fpath).name}"
            f"{' (replace all)' if replace_all else ''} ---"
        )

        def progress(msg: str):
            self.root.after(0, lambda m=msg: (self._log(m), self.status_var.set(m)))

        def work():
            try:
                self.root.after(
                    0, lambda: self._set_busy(True, "Uploading…")
                )
                save_config(api, user, pwd)
                result = run_upload(
                    api,
                    user,
                    pwd,
                    utype,
                    fpath,
                    replace_all,
                    progress_cb=progress,
                )
                text = format_result(result)
                self.root.after(
                    0,
                    lambda: (
                        self._log(text),
                        messagebox.showinfo("Success", "Data uploaded successfully!"),
                        self._set_busy(False, "Upload finished"),
                    ),
                )
            except Exception as exc:
                msg = str(exc)
                self.root.after(
                    0,
                    lambda: (
                        self._log(f"ERROR: {msg}"),
                        messagebox.showerror("Upload failed", msg),
                        self._set_busy(False, "Upload failed"),
                    ),
                )

        threading.Thread(target=work, daemon=True).start()

    def run(self) -> None:
        self.root.mainloop()


def main() -> int:
    parser = argparse.ArgumentParser(description=APP_NAME)
    parser.add_argument("--cli", action="store_true", help="Run without GUI")
    parser.add_argument("--api", default=None, help="API base URL")
    parser.add_argument("--user", default=None, help="Username")
    parser.add_argument("--password", default=None, help="Password")
    parser.add_argument(
        "--type",
        choices=list(UPLOAD_TYPES.keys()),
        default="customers",
        help="Upload type",
    )
    parser.add_argument("--file", default=None, help="Path to .xlsx or .json")
    parser.add_argument(
        "--replace-all",
        action="store_true",
        help="Replace all existing records (Excel + JSON)",
    )
    parser.add_argument(
        "--download-template",
        action="store_true",
        help="Download Excel template for --type (needs login)",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Output path for --download-template",
    )
    args = parser.parse_args()

    if args.cli or args.download_template:
        cfg = load_config()
        api = args.api or cfg.get("server", "api_url", fallback=DEFAULT_API)
        user = args.user or cfg.get("login", "username", fallback="")
        password = args.password or cfg.get("login", "password", fallback="")
        try:
            if args.download_template:
                api_base = normalize_api_url(api)
                token = login(api_base, user, password)
                out = Path(
                    args.out
                    or UPLOAD_TYPES[args.type]["template_name"]
                )
                path = download_template(api_base, token, args.type, out)
                print(f"Template saved: {path}")
                return 0
            if not args.file:
                print("--file is required in CLI mode", file=sys.stderr)
                return 1

            def progress(msg: str):
                print(msg, flush=True)

            result = run_upload(
                api,
                user,
                password,
                args.type,
                args.file,
                args.replace_all,
                progress_cb=progress,
            )
            print(format_result(result))
            return 0
        except Exception as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1

    UploaderApp().run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
