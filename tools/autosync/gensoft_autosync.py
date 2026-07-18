"""
GenSoft Sync — one EXE + one config.ini

1. Runs your VFP PRG / BAT / EXE on a timer (and at Windows startup)
2. Reads Excel files from a folder
3. Uploads to GenSoft cloud
4. Deletes each file only after that upload succeeds

Usage:
  GenSoftSync.exe
  GenSoftSync.exe --once
  GenSoftSync.exe --install-startup
  GenSoftSync.exe --uninstall-startup
"""

from __future__ import annotations

import argparse
import configparser
import os
import subprocess
import sys
import threading
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext, ttk

APP_NAME = "GenSoft Sync"
VERSION = "2.2.0"
TASK_NAME = "GenSoftSync"
DEFAULT_API = "https://gensoft-order.onrender.com"

# Expected file names in the export folder (first match wins)
FILE_NAMES = {
    "customers": [
        "customers.xlsx",
        "customers.xls",
        "customers.csv",
        "customers.txt",
        "parties.xlsx",
        "parties.xls",
        "parties.txt",
    ],
    "products": [
        "products_stock.xlsx",
        "products_stock.xls",
        "products_stock.csv",
        "products_stock.txt",
        "products.xlsx",
        "products.xls",
        "products.txt",
    ],
    "outstanding": [
        "outstanding.xlsx",
        "outstanding.xls",
        "outstanding.csv",
        "outstanding.txt",
        "bills.xlsx",
        "bills.xls",
        "bills.txt",
    ],
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

    # Everything lives next to the EXE by default (same software folder)
    base = app_dir()
    defaults = {
        "cloud": {
            "api_url": DEFAULT_API,
            "username": "",
            "password": "",
        },
        "vfp": {
            # BAT / EXE in the same folder as GenSoftSync.exe
            "run_command": str(base / "run_vfp_export.bat"),
        },
        "sync": {
            # Excel files are created/deleted in the same folder as the EXE
            "folder": str(base),
            "every_minutes": "60",
            "delete_after_upload": "true",
            "replace_all": "true",
            "run_on_start": "true",
            "export_timeout_sec": "600",
        },
    }
    for section, items in defaults.items():
        if section not in cfg:
            cfg[section] = {}
        for k, v in items.items():
            cfg[section].setdefault(k, v)
    return cfg


def save_config(cfg: configparser.ConfigParser) -> None:
    with open(config_path(), "w", encoding="utf-8") as f:
        cfg.write(f)


def _import_uploader():
    # Bundled copy first — a stale gensoft_upload.py next to the EXE
    # must never override the version shipped inside GenSoftSync.exe.
    search = [
        Path(getattr(sys, "_MEIPASS", "")),
        app_dir(),
        app_dir().parent / "uploader",
    ]
    for up in search:
        if not up or not str(up) or not up.exists():
            continue
        s = str(up)
        if s not in sys.path:
            sys.path.insert(0, s)
        try:
            import gensoft_upload as gu  # noqa: WPS433

            return gu
        except ImportError:
            continue
    raise RuntimeError("Could not load upload module (gensoft_upload).")


def _import_export_files():
    search = [Path(getattr(sys, "_MEIPASS", "")), app_dir()]
    for here in search:
        if not here or not str(here) or not here.exists():
            continue
        s = str(here)
        if s not in sys.path:
            sys.path.insert(0, s)
        try:
            import export_files as ef  # noqa: WPS433

            return ef
        except ImportError:
            continue
    return None


def exe_path_for_startup() -> str:
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}"'
    return f'"{sys.executable}" "{Path(__file__).resolve()}"'


def install_startup() -> str:
    cmd = (
        f'schtasks /Create /F /TN "{TASK_NAME}" /SC ONLOGON '
        f'/RL LIMITED /TR {exe_path_for_startup()}'
    )
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        err = (result.stderr or result.stdout or "unknown error").strip()
        raise RuntimeError(f"Could not create startup task:\n{err}")
    return f"{APP_NAME} will start when you log on to Windows."


def uninstall_startup() -> str:
    result = subprocess.run(
        f'schtasks /Delete /F /TN "{TASK_NAME}"',
        shell=True,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        err = (result.stderr or result.stdout or "").strip()
        if "cannot find" in err.lower() or "not found" in err.lower():
            return "Startup was not installed."
        raise RuntimeError(f"Could not remove startup:\n{err}")
    return "Startup removed."


def startup_installed() -> bool:
    result = subprocess.run(
        f'schtasks /Query /TN "{TASK_NAME}"',
        shell=True,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def run_vfp_command(command: str, folder: Path, timeout_sec: int, log) -> None:
    cmd = (command or "").strip()
    if not cmd:
        raise RuntimeError(
            "Set [vfp] run_command in config.ini to your BAT / EXE / VFP PRG command."
        )
    folder.mkdir(parents=True, exist_ok=True)
    log(f"Running VFP export:\n  {cmd}")
    result = subprocess.run(
        cmd,
        shell=True,
        cwd=str(folder),
        capture_output=True,
        text=True,
        timeout=max(30, int(timeout_sec or 600)),
    )
    if result.stdout:
        log(result.stdout.strip()[-1500:])
    if result.stderr:
        log(result.stderr.strip()[-800:])
    if result.returncode != 0:
        raise RuntimeError(
            f"VFP / export command failed (exit {result.returncode}). "
            "Check run_command in config.ini."
        )
    log("Export finished OK")


def find_files(folder: Path, log) -> dict[str, Path]:
    """Find customers / products / outstanding files; convert txt/csv → xlsx if needed."""
    ef = _import_export_files()
    if ef:
        return ef.resolve_export_files(
            folder, "customers,products,outstanding", log=log
        )

    # Minimal fallback without export_files module
    found: dict[str, Path] = {}
    for utype, names in FILE_NAMES.items():
        for name in names:
            p = folder / name
            if p.is_file():
                found[utype] = p
                log(f"Found {p.name} for {utype}")
                break
        else:
            log(f"No file for {utype}")
    return found


def safe_delete(path: Path, log) -> None:
    try:
        if path.is_file():
            path.unlink()
            log(f"  Deleted {path.name}")
        # Also remove matching .txt/.csv source if we uploaded .xlsx
        stem = path.stem
        for ext in (".txt", ".csv", ".tsv", ".xls"):
            sibling = path.with_name(stem + ext)
            if sibling.is_file() and sibling != path:
                sibling.unlink()
                log(f"  Deleted {sibling.name}")
    except OSError as exc:
        log(f"  Could not delete {path.name}: {exc}")


def resolve_run_command(command: str) -> str:
    """Resolve a relative BAT/EXE to the software folder (next to GenSoftSync.exe)."""
    cmd = (command or "").strip()
    if not cmd:
        return cmd
    # Already a quoted path or multi-arg VFP command — leave as-is if absolute first token
    first = cmd.strip('"').split()[0] if cmd else ""
    p = Path(first)
    if p.is_absolute():
        return cmd
    # Relative single file → look next to EXE
    local = app_dir() / cmd.strip('"')
    if local.is_file():
        return f'"{local}"' if " " in str(local) else str(local)
    # Relative first token of a longer command
    local2 = app_dir() / first
    if local2.is_file():
        rest = cmd[len(cmd.split()[0]) :] if " " in cmd else ""
        base = f'"{local2}"' if " " in str(local2) else str(local2)
        return base + rest
    return cmd


def run_sync_cycle(cfg: configparser.ConfigParser, log) -> None:
    gu = _import_uploader()

    api = cfg.get("cloud", "api_url", fallback=DEFAULT_API)
    user = cfg.get("cloud", "username", fallback="")
    password = cfg.get("cloud", "password", fallback="")
    if not user or not password:
        raise RuntimeError("Set username and password in config.ini [cloud] section.")

    folder_raw = cfg.get("sync", "folder", fallback=".").strip() or "."
    folder = Path(folder_raw)
    if not folder.is_absolute():
        folder = (app_dir() / folder).resolve()
    else:
        folder = folder.resolve()

    command = resolve_run_command(cfg.get("vfp", "run_command", fallback=""))
    timeout = cfg.getint("sync", "export_timeout_sec", fallback=600)
    replace_all = cfg.getboolean("sync", "replace_all", fallback=True)
    delete_ok = cfg.getboolean("sync", "delete_after_upload", fallback=True)

    log(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] Sync start")
    log(f"Software folder: {app_dir()}")
    log(f"Excel folder: {folder}")

    run_vfp_command(command, folder, timeout, log)
    files = find_files(folder, log)
    if not files:
        raise RuntimeError(
            f"No Excel files found in {folder}.\n"
            "Your PRG must create at least one of:\n"
            "  customers.xlsx / customers.xls\n"
            "  products_stock.xlsx / products_stock.xls\n"
            "  outstanding.xlsx / outstanding.xls\n"
            "(in the same folder as GenSoftSync.exe when folder = .)"
        )

    log(f"Logging in to {api}…")
    api_base = gu.normalize_api_url(api)
    token = gu.login(api_base, user, password)

    for utype, path in files.items():
        log(f"Uploading {utype}: {path.name}…")
        try:
            result = gu.upload_file(
                api_base,
                token,
                utype,
                path,
                replace_all=replace_all,
                progress_cb=log,
            )
            created = result.get("created", result.get("uploaded", "?"))
            failed = int(result.get("failed", 0) or 0)
            skipped = int(result.get("skipped", 0) or 0)
            log(f"  → changed={created} skipped={skipped} failed={failed}")
            if failed == 0 and delete_ok:
                safe_delete(path, log)
            elif failed > 0:
                log(f"  Kept {path.name} (upload had failures)")
        except Exception as exc:
            log(f"  FAILED {path.name}: {exc}")
            log(f"  Kept {path.name} for next run")

    log(f"[{datetime.now():%H:%M:%S}] Sync finished.\n")


class SyncApp:
    def __init__(self) -> None:
        self.cfg = load_config()
        self.root = tk.Tk()
        self.root.title(f"{APP_NAME} v{VERSION}")
        self.root.geometry("720x560")
        self.root.minsize(560, 440)

        self._timer = None
        self._busy = False
        self._stop = False

        self.api_var = tk.StringVar(value=self.cfg.get("cloud", "api_url"))
        self.user_var = tk.StringVar(value=self.cfg.get("cloud", "username"))
        self.pass_var = tk.StringVar(value=self.cfg.get("cloud", "password"))
        self.cmd_var = tk.StringVar(value=self.cfg.get("vfp", "run_command"))
        self.folder_var = tk.StringVar(value=self.cfg.get("sync", "folder"))
        self.interval_var = tk.StringVar(value=self.cfg.get("sync", "every_minutes"))
        self.delete_var = tk.BooleanVar(
            value=self.cfg.getboolean("sync", "delete_after_upload", fallback=True)
        )
        self.replace_var = tk.BooleanVar(
            value=self.cfg.getboolean("sync", "replace_all", fallback=True)
        )
        self.status_var = tk.StringVar(value="Idle")

        self._build_ui()
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        if self.cfg.getboolean("sync", "run_on_start", fallback=True):
            self.root.after(1000, self._sync_now)
        self.root.after(2000, self._arm_timer)

    def _build_ui(self) -> None:
        pad = {"padx": 8, "pady": 4}
        frm = ttk.Frame(self.root, padding=12)
        frm.pack(fill=tk.BOTH, expand=True)

        ttk.Label(frm, text=APP_NAME, font=("Segoe UI", 14, "bold")).grid(
            row=0, column=0, columnspan=3, sticky="w"
        )
        ttk.Label(
            frm,
            text="Run the app from any folder and select the separate Excel export folder below.",
        ).grid(row=1, column=0, columnspan=3, sticky="w", pady=(0, 10))

        ttk.Label(frm, text="Cloud API").grid(row=2, column=0, sticky="w", **pad)
        ttk.Entry(frm, textvariable=self.api_var, width=50).grid(
            row=2, column=1, columnspan=2, sticky="ew", **pad
        )

        ttk.Label(frm, text="Username").grid(row=3, column=0, sticky="w", **pad)
        ttk.Entry(frm, textvariable=self.user_var, width=24).grid(
            row=3, column=1, sticky="w", **pad
        )
        ttk.Label(frm, text="Password").grid(row=4, column=0, sticky="w", **pad)
        ttk.Entry(frm, textvariable=self.pass_var, show="*", width=24).grid(
            row=4, column=1, sticky="w", **pad
        )

        ttk.Separator(frm).grid(row=5, column=0, columnspan=3, sticky="ew", pady=8)

        ttk.Label(frm, text="Run this (BAT / EXE / VFP)").grid(
            row=6, column=0, sticky="w", **pad
        )
        ttk.Entry(frm, textvariable=self.cmd_var, width=48).grid(
            row=6, column=1, sticky="ew", **pad
        )
        ttk.Button(frm, text="Browse…", command=self._browse_cmd).grid(
            row=6, column=2, sticky="w", **pad
        )

        ttk.Label(frm, text="Excel files folder").grid(
            row=7, column=0, sticky="w", **pad
        )
        ttk.Entry(frm, textvariable=self.folder_var, width=48).grid(
            row=7, column=1, sticky="ew", **pad
        )
        folder_buttons = ttk.Frame(frm)
        folder_buttons.grid(row=7, column=2, sticky="w", **pad)
        ttk.Button(folder_buttons, text="Browse…", command=self._browse_folder).pack(
            side=tk.LEFT
        )
        ttk.Button(folder_buttons, text="Open", command=self._open_folder).pack(
            side=tk.LEFT, padx=(4, 0)
        )

        ttk.Label(frm, text="Every (minutes)").grid(row=8, column=0, sticky="w", **pad)
        ttk.Entry(frm, textvariable=self.interval_var, width=8).grid(
            row=8, column=1, sticky="w", **pad
        )

        ttk.Checkbutton(
            frm,
            text="Delete Excel file after successful upload",
            variable=self.delete_var,
        ).grid(row=9, column=0, columnspan=2, sticky="w", **pad)
        ttk.Checkbutton(
            frm,
            text="Full sync: also remove cloud rows missing from Excel",
            variable=self.replace_var,
        ).grid(row=10, column=0, columnspan=2, sticky="w", **pad)

        btns = ttk.Frame(frm)
        btns.grid(row=11, column=0, columnspan=3, sticky="ew", pady=10)
        ttk.Button(btns, text="Save config", command=self._save).pack(
            side=tk.LEFT, padx=4
        )
        ttk.Button(btns, text="Run now", command=self._sync_now).pack(
            side=tk.LEFT, padx=4
        )
        ttk.Button(
            btns, text="Start with Windows", command=self._install
        ).pack(side=tk.LEFT, padx=4)
        ttk.Button(btns, text="Remove startup", command=self._uninstall).pack(
            side=tk.LEFT, padx=4
        )

        ttk.Label(frm, textvariable=self.status_var).grid(
            row=12, column=0, columnspan=3, sticky="w", **pad
        )

        self.log = scrolledtext.ScrolledText(frm, height=14, font=("Consolas", 9))
        self.log.grid(row=13, column=0, columnspan=3, sticky="nsew")
        frm.columnconfigure(1, weight=1)
        frm.rowconfigure(13, weight=1)

        installed = "Yes" if startup_installed() else "No"
        self._log(
            f"{APP_NAME} v{VERSION}\n"
            f"Config file: {config_path()}\n"
            f"Windows startup: {installed}\n"
            "Edit config.ini or use this window — only these two files are needed.\n"
        )

    def _browse_cmd(self) -> None:
        path = filedialog.askopenfilename(
            title="Select BAT / EXE that runs your VFP PRG",
            filetypes=[
                ("Programs", "*.bat;*.cmd;*.exe"),
                ("All", "*.*"),
            ],
        )
        if path:
            q = f'"{path}"' if " " in path and not path.startswith('"') else path
            self.cmd_var.set(q)

    def _browse_folder(self) -> None:
        current = Path(self.folder_var.get().strip() or ".")
        if not current.is_absolute():
            current = (app_dir() / current).resolve()
        initial = str(current) if current.is_dir() else str(app_dir())
        path = filedialog.askdirectory(
            title="Select folder containing exported Excel files",
            initialdir=initial,
            mustexist=True,
        )
        if path:
            self.folder_var.set(path)

    def _open_folder(self) -> None:
        path = Path(self.folder_var.get().strip() or ".")
        if not path.is_absolute():
            path = (app_dir() / path).resolve()
        path.mkdir(parents=True, exist_ok=True)
        os.startfile(path)

    def _log(self, text: str) -> None:
        self.log.insert(tk.END, text + ("" if text.endswith("\n") else "\n"))
        self.log.see(tk.END)

    def _persist(self) -> None:
        self.cfg["cloud"]["api_url"] = self.api_var.get().strip()
        self.cfg["cloud"]["username"] = self.user_var.get().strip()
        self.cfg["cloud"]["password"] = self.pass_var.get()
        self.cfg["vfp"]["run_command"] = self.cmd_var.get().strip()
        self.cfg["sync"]["folder"] = self.folder_var.get().strip()
        self.cfg["sync"]["every_minutes"] = self.interval_var.get().strip() or "60"
        self.cfg["sync"]["delete_after_upload"] = (
            "true" if self.delete_var.get() else "false"
        )
        self.cfg["sync"]["replace_all"] = "true" if self.replace_var.get() else "false"
        save_config(self.cfg)

    def _save(self) -> None:
        self._persist()
        messagebox.showinfo("Saved", f"Saved:\n{config_path()}")

    def _install(self) -> None:
        try:
            self._persist()
            msg = install_startup()
            self._log(msg)
            messagebox.showinfo("Startup", msg)
        except Exception as exc:
            messagebox.showerror("Startup", str(exc))

    def _uninstall(self) -> None:
        try:
            msg = uninstall_startup()
            self._log(msg)
            messagebox.showinfo("Startup", msg)
        except Exception as exc:
            messagebox.showerror("Startup", str(exc))

    def _interval_ms(self) -> int:
        try:
            mins = max(5, int(float(self.interval_var.get() or 60)))
        except ValueError:
            mins = 60
        return mins * 60 * 1000

    def _arm_timer(self) -> None:
        if self._stop:
            return
        if self._timer is not None:
            self.root.after_cancel(self._timer)
        self._timer = self.root.after(self._interval_ms(), self._on_timer)

    def _on_timer(self) -> None:
        self._sync_now()
        self._arm_timer()

    def _sync_now(self) -> None:
        if self._busy:
            return
        self._persist()

        def work():
            try:
                self.root.after(0, lambda: self.status_var.set("Running…"))
                self._busy = True

                def log(msg: str):
                    self.root.after(0, lambda m=msg: self._log(m))

                run_sync_cycle(self.cfg, log)
                self.root.after(
                    0, lambda: self.status_var.set("Idle — waiting for next run")
                )
            except Exception as exc:
                msg = str(exc)
                self.root.after(
                    0,
                    lambda: (
                        self._log(f"ERROR: {msg}"),
                        self.status_var.set("Error — see log"),
                    ),
                )
            finally:
                self._busy = False

        threading.Thread(target=work, daemon=True).start()

    def _on_close(self) -> None:
        self._stop = True
        if self._timer is not None:
            try:
                self.root.after_cancel(self._timer)
            except Exception:
                pass
        self.root.destroy()

    def run(self) -> None:
        self.root.mainloop()


def main() -> int:
    parser = argparse.ArgumentParser(description=APP_NAME)
    parser.add_argument("--once", action="store_true", help="Run one sync and exit")
    parser.add_argument("--install-startup", action="store_true")
    parser.add_argument("--uninstall-startup", action="store_true")
    args = parser.parse_args()

    if args.install_startup:
        print(install_startup())
        return 0
    if args.uninstall_startup:
        print(uninstall_startup())
        return 0

    if args.once:
        cfg = load_config()

        def log(msg: str):
            print(msg, flush=True)

        try:
            run_sync_cycle(cfg, log)
            return 0
        except Exception as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 1

    SyncApp().run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
