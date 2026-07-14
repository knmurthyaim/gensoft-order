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
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext, ttk

import requests

APP_NAME = "GenSoft Data Uploader"
VERSION = "1.0.0"
DEFAULT_API = "https://gensoft-order.onrender.com"

UPLOAD_TYPES = {
    "customers": {
        "label": "Customers / Parties",
        "json_path": "/api/parties/upload",
        "excel_path": "/api/parties/upload/excel",
    },
    "products": {
        "label": "Products + Stock",
        "json_path": "/api/products/upload",
        "excel_path": "/api/products/upload/excel",
    },
    "outstanding": {
        "label": "Outstanding Bills",
        "json_path": "/api/outstanding/upload",
        "excel_path": "/api/outstanding/upload/excel",
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


def login(api_base: str, username: str, password: str) -> str:
    resp = requests.post(
        f"{api_base}/api/auth/login",
        json={"username": username, "password": password},
        timeout=120,
    )
    if resp.status_code != 200:
        detail = resp.text
        try:
            detail = resp.json().get("detail", detail)
        except Exception:
            pass
        raise RuntimeError(f"Login failed ({resp.status_code}): {detail}")
    data = resp.json()
    token = data.get("access_token") or data.get("token")
    if not token:
        raise RuntimeError("Login succeeded but no token in response.")
    return token


def upload_file(
    api_base: str,
    token: str,
    upload_type: str,
    file_path: Path,
    replace_all: bool = False,
) -> dict:
    if upload_type not in UPLOAD_TYPES:
        raise ValueError(f"Unknown upload type: {upload_type}")

    meta = UPLOAD_TYPES[upload_type]
    headers = {"Authorization": f"Bearer {token}"}
    suffix = file_path.suffix.lower()

    if suffix == ".xlsx":
        url = f"{api_base}{meta['excel_path']}"
        with open(file_path, "rb") as f:
            resp = requests.post(
                url,
                headers=headers,
                files={"file": (file_path.name, f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
                timeout=300,
            )
    elif suffix == ".json":
        url = f"{api_base}{meta['json_path']}"
        with open(file_path, encoding="utf-8") as f:
            payload = json.load(f)
        if isinstance(payload, dict) and "replace_all" not in payload:
            payload["replace_all"] = replace_all
        resp = requests.post(url, headers={**headers, "Content-Type": "application/json"}, json=payload, timeout=300)
    else:
        raise ValueError("File must be .xlsx or .json")

    if resp.status_code not in (200, 201):
        detail = resp.text
        try:
            detail = resp.json().get("detail", detail)
        except Exception:
            pass
        raise RuntimeError(f"Upload failed ({resp.status_code}): {detail}")

    return resp.json()


def run_upload(
    api_url: str,
    username: str,
    password: str,
    upload_type: str,
    file_path: str | Path,
    replace_all: bool = False,
) -> dict:
    api_base = normalize_api_url(api_url)
    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"File not found: {path}")

    token = login(api_base, username, password)
    return upload_file(api_base, token, upload_type, path, replace_all)


def format_result(result: dict) -> str:
    lines = ["Upload completed successfully.", ""]
    for key in ("created", "updated", "skipped", "errors", "total"):
        if key in result:
            lines.append(f"  {key}: {result[key]}")
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
        self.root.geometry("640x520")
        self.root.minsize(520, 420)

        cfg = load_config()
        self.api_var = tk.StringVar(value=cfg.get("server", "api_url", fallback=DEFAULT_API))
        self.user_var = tk.StringVar(value=cfg.get("login", "username", fallback=""))
        self.pass_var = tk.StringVar(value=cfg.get("login", "password", fallback=""))
        self.type_var = tk.StringVar(value="customers")
        self.file_var = tk.StringVar(value="")
        self.replace_var = tk.BooleanVar(value=False)

        self._build_ui()

    def _build_ui(self) -> None:
        pad = {"padx": 10, "pady": 4}
        frm = ttk.Frame(self.root, padding=10)
        frm.pack(fill=tk.BOTH, expand=True)

        ttk.Label(frm, text=APP_NAME, font=("Segoe UI", 14, "bold")).grid(row=0, column=0, columnspan=3, sticky="w", pady=(0, 8))

        ttk.Label(frm, text="API URL:").grid(row=1, column=0, sticky="w", **pad)
        ttk.Entry(frm, textvariable=self.api_var, width=50).grid(row=1, column=1, columnspan=2, sticky="ew", **pad)

        ttk.Label(frm, text="Username:").grid(row=2, column=0, sticky="w", **pad)
        ttk.Entry(frm, textvariable=self.user_var, width=30).grid(row=2, column=1, columnspan=2, sticky="w", **pad)

        ttk.Label(frm, text="Password:").grid(row=3, column=0, sticky="w", **pad)
        ttk.Entry(frm, textvariable=self.pass_var, show="*", width=30).grid(row=3, column=1, columnspan=2, sticky="w", **pad)

        ttk.Label(frm, text="Data type:").grid(row=4, column=0, sticky="w", **pad)
        type_combo = ttk.Combobox(
            frm,
            textvariable=self.type_var,
            values=list(UPLOAD_TYPES.keys()),
            state="readonly",
            width=28,
        )
        type_combo.grid(row=4, column=1, sticky="w", **pad)
        self.type_label = ttk.Label(frm, text=UPLOAD_TYPES["customers"]["label"])
        self.type_label.grid(row=4, column=2, sticky="w", **pad)
        type_combo.bind("<<ComboboxSelected>>", self._on_type_change)

        ttk.Label(frm, text="File (.xlsx / .json):").grid(row=5, column=0, sticky="w", **pad)
        ttk.Entry(frm, textvariable=self.file_var, width=40).grid(row=5, column=1, sticky="ew", **pad)
        ttk.Button(frm, text="Browse...", command=self._browse).grid(row=5, column=2, sticky="w", **pad)

        ttk.Checkbutton(frm, text="Replace all existing records (JSON only; outstanding)", variable=self.replace_var).grid(
            row=6, column=1, columnspan=2, sticky="w", **pad
        )

        btn_row = ttk.Frame(frm)
        btn_row.grid(row=7, column=0, columnspan=3, sticky="ew", pady=8)
        ttk.Button(btn_row, text="Upload to Cloud", command=self._upload).pack(side=tk.LEFT, padx=4)
        ttk.Button(btn_row, text="Save login", command=self._save_login).pack(side=tk.LEFT, padx=4)
        ttk.Button(btn_row, text="Open samples folder", command=self._open_samples).pack(side=tk.LEFT, padx=4)

        ttk.Label(frm, text="Log:").grid(row=8, column=0, sticky="nw", **pad)
        self.log = scrolledtext.ScrolledText(frm, height=14, wrap=tk.WORD, font=("Consolas", 9))
        self.log.grid(row=8, column=1, columnspan=2, sticky="nsew", **pad)

        frm.columnconfigure(1, weight=1)
        frm.rowconfigure(8, weight=1)

        self._log(f"{APP_NAME} ready.\nCloud API: {DEFAULT_API}\n")

    def _on_type_change(self, _event=None) -> None:
        key = self.type_var.get()
        self.type_label.config(text=UPLOAD_TYPES.get(key, {}).get("label", key))

    def _browse(self) -> None:
        path = filedialog.askopenfilename(
            title="Select data file",
            filetypes=[("Excel", "*.xlsx"), ("JSON", "*.json"), ("All", "*.*")],
        )
        if path:
            self.file_var.set(path)

    def _log(self, text: str) -> None:
        self.log.insert(tk.END, text + ("\n" if not text.endswith("\n") else ""))
        self.log.see(tk.END)

    def _save_login(self) -> None:
        save_config(self.api_var.get(), self.user_var.get(), self.pass_var.get())
        messagebox.showinfo("Saved", f"Settings saved to:\n{config_path()}")

    def _open_samples(self) -> None:
        samples = app_dir().parent.parent / "samples"
        if not samples.exists():
            samples = Path.cwd() / "samples"
        if samples.exists():
            os.startfile(samples)
        else:
            messagebox.showwarning("Not found", "samples folder not found next to the uploader.")

    def _upload(self) -> None:
        api = self.api_var.get().strip()
        user = self.user_var.get().strip()
        pwd = self.pass_var.get()
        fpath = self.file_var.get().strip()
        utype = self.type_var.get()

        if not api or not user or not pwd:
            messagebox.showerror("Missing fields", "API URL, username, and password are required.")
            return
        if not fpath:
            messagebox.showerror("Missing file", "Please select an Excel or JSON file.")
            return

        self._log(f"\n--- Uploading {utype} from {Path(fpath).name} ---")
        self.root.update()

        try:
            save_config(api, user, pwd)
            result = run_upload(api, user, pwd, utype, fpath, self.replace_var.get())
            self._log(format_result(result))
            messagebox.showinfo("Success", "Data uploaded successfully!")
        except Exception as exc:
            self._log(f"ERROR: {exc}")
            messagebox.showerror("Upload failed", str(exc))

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
    parser.add_argument("--replace-all", action="store_true", help="Replace all (JSON)")
    args = parser.parse_args()

    if args.cli:
        cfg = load_config()
        api = args.api or cfg.get("server", "api_url", fallback=DEFAULT_API)
        user = args.user or cfg.get("login", "username", fallback="")
        password = args.password or cfg.get("login", "password", fallback="")
        if not args.file:
            print("--file is required in CLI mode", file=sys.stderr)
            return 1
        try:
            result = run_upload(api, user, password, args.type, args.file, args.replace_all)
            print(format_result(result))
            return 0
        except Exception as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1

    UploaderApp().run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
