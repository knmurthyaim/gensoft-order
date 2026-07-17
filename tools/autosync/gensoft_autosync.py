"""
GenSoft Auto Sync — create/upload Excel to Render on a schedule / Windows startup.

Data source options (VFP6-friendly):
  external  = run your billing EXE / BAT / VFP export command, then upload files
  folder    = upload whatever files are already in the export folder
  sql       = export from Lamrin SQL Server (optional; not used for VFP sites)

Usage:
  python gensoft_autosync.py
  python gensoft_autosync.py --once
  python gensoft_autosync.py --install-startup
  python gensoft_autosync.py --uninstall-startup
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

APP_NAME = "GenSoft Auto Sync"
VERSION = "1.1.0"
TASK_NAME = "GenSoftAutoSync"
DEFAULT_API = "https://gensoft-order.onrender.com"

SOURCE_LABELS = {
    "external": "VFP / Run EXE (recommended)",
    "folder": "Folder only (upload existing files)",
    "sql": "SQL Server (Lamrin)",
}
LABEL_TO_SOURCE = {v: k for k, v in SOURCE_LABELS.items()}


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
    for section, defaults in (
        ("server", {"api_url": DEFAULT_API}),
        ("login", {"username": "", "password": ""}),
        (
            "sql",
            {
                "server": ".",
                "database": "Lamrin",
                "user": "sa",
                "password": "Gensoft123",
                "driver": "ODBC Driver 17 for SQL Server",
                "trust_server_certificate": "true",
            },
        ),
        (
            "external",
            {
                "command": "",
                "working_dir": r"C:\GenSoftExports",
                "timeout_sec": "600",
            },
        ),
        (
            "sync",
            {
                "source": "external",
                "export_dir": r"C:\GenSoftExports",
                "interval_minutes": "60",
                "sync_types": "customers,products,outstanding",
                "replace_all": "true",
                "outstanding_mode": "sale_invoices",
                "run_on_start": "true",
            },
        ),
    ):
        if section not in cfg:
            cfg[section] = {}
        for k, v in defaults.items():
            cfg[section].setdefault(k, v)
    return cfg


def save_config(cfg: configparser.ConfigParser) -> None:
    with open(config_path(), "w", encoding="utf-8") as f:
        cfg.write(f)


def _uploader_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", app_dir()))
    return app_dir().parent / "uploader"


def _import_uploader():
    for up in (
        _uploader_dir(),
        app_dir(),
        app_dir().parent / "uploader",
        Path(getattr(sys, "_MEIPASS", "")),
    ):
        if not up or not str(up):
            continue
        if not up.exists():
            continue
        s = str(up)
        if s not in sys.path:
            sys.path.insert(0, s)
        try:
            import gensoft_upload as gu  # noqa: WPS433

            return gu
        except ImportError:
            continue
    raise RuntimeError("Could not import gensoft_upload.")


def _import_module(name: str):
    for here in (app_dir(), Path(getattr(sys, "_MEIPASS", ""))):
        if not here or not str(here) or not here.exists():
            continue
        s = str(here)
        if s not in sys.path:
            sys.path.insert(0, s)
        try:
            return __import__(name)
        except ImportError:
            continue
    raise RuntimeError(f"Could not import {name}")


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
    return f"Windows will start {APP_NAME} at logon (task: {TASK_NAME})."


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
            return "Startup task was not installed."
        raise RuntimeError(f"Could not remove startup task:\n{err}")
    return "Startup task removed."


def startup_installed() -> bool:
    result = subprocess.run(
        f'schtasks /Query /TN "{TASK_NAME}"',
        shell=True,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0


def run_sync_cycle(cfg: configparser.ConfigParser, log) -> None:
    gu = _import_uploader()
    files_mod = _import_module("export_files")

    api = cfg.get("server", "api_url", fallback=DEFAULT_API)
    user = cfg.get("login", "username", fallback="")
    password = cfg.get("login", "password", fallback="")
    if not user or not password:
        raise RuntimeError("Set cloud username/password in config (login section).")

    export_dir = Path(
        cfg.get("sync", "export_dir", fallback=r"C:\GenSoftExports")
    )
    export_dir.mkdir(parents=True, exist_ok=True)
    replace_all = cfg.getboolean("sync", "replace_all", fallback=True)
    sync_types = cfg.get(
        "sync", "sync_types", fallback="customers,products,outstanding"
    )
    source = (cfg.get("sync", "source", fallback="external") or "external").strip().lower()

    log(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] Source={source}")

    if source == "sql":
        ex = _import_module("export_lamrin")
        sql_cfg = {
            "server": cfg.get("sql", "server", fallback="."),
            "database": cfg.get("sql", "database", fallback="Lamrin"),
            "user": cfg.get("sql", "user", fallback=""),
            "password": cfg.get("sql", "password", fallback=""),
            "driver": cfg.get(
                "sql", "driver", fallback="ODBC Driver 17 for SQL Server"
            ),
            "trust_server_certificate": cfg.get(
                "sql", "trust_server_certificate", fallback="true"
            ),
            "sync_types": sync_types,
            "outstanding_mode": cfg.get(
                "sync", "outstanding_mode", fallback="sale_invoices"
            ),
        }
        log(f"Exporting from SQL ({sql_cfg['database']})…")
        files = ex.export_all(sql_cfg, export_dir, log=log)
    else:
        if source == "external":
            command = cfg.get("external", "command", fallback="")
            work = cfg.get(
                "external", "working_dir", fallback=str(export_dir)
            ) or str(export_dir)
            timeout = cfg.getint("external", "timeout_sec", fallback=600)
            files_mod.run_external_export(
                command, work, timeout_sec=timeout, log=log
            )
        else:
            log("Folder mode — using existing files (no export EXE).")

        files = files_mod.resolve_export_files(export_dir, sync_types, log=log)

    if not files:
        raise RuntimeError(
            f"No export files found in {export_dir}.\n"
            "Expected names like customers.xlsx / products_stock.xlsx / outstanding.xlsx "
            "(or .txt / .csv). For VFP, run your export EXE/PRG first."
        )

    log(f"Logging in to {api}…")
    api_base = gu.normalize_api_url(api)
    token = gu.login(api_base, user, password)

    for utype, path in files.items():
        log(f"Uploading {utype}: {path.name}…")
        result = gu.upload_file(
            api_base,
            token,
            utype,
            path,
            replace_all=replace_all,
            progress_cb=log,
        )
        created = result.get("created", result.get("uploaded", "?"))
        failed = result.get("failed", 0)
        log(f"  → ok={created} failed={failed}")

    log(f"[{datetime.now():%H:%M:%S}] Sync cycle finished.\n")


class AutoSyncApp:
    def __init__(self) -> None:
        self.cfg = load_config()
        self.root = tk.Tk()
        self.root.title(f"{APP_NAME} v{VERSION}")
        self.root.geometry("760x620")
        self.root.minsize(600, 480)

        self._timer = None
        self._busy = False
        self._stop = False

        src = self.cfg.get("sync", "source", fallback="external")
        self.source_var = tk.StringVar(
            value=SOURCE_LABELS.get(src, SOURCE_LABELS["external"])
        )
        self.api_var = tk.StringVar(value=self.cfg.get("server", "api_url"))
        self.user_var = tk.StringVar(value=self.cfg.get("login", "username"))
        self.pass_var = tk.StringVar(value=self.cfg.get("login", "password"))
        self.sql_server_var = tk.StringVar(value=self.cfg.get("sql", "server"))
        self.sql_db_var = tk.StringVar(value=self.cfg.get("sql", "database"))
        self.sql_user_var = tk.StringVar(value=self.cfg.get("sql", "user"))
        self.sql_pass_var = tk.StringVar(value=self.cfg.get("sql", "password"))
        self.ext_cmd_var = tk.StringVar(
            value=self.cfg.get("external", "command", fallback="")
        )
        self.ext_work_var = tk.StringVar(
            value=self.cfg.get("external", "working_dir", fallback=r"C:\GenSoftExports")
        )
        self.interval_var = tk.StringVar(
            value=self.cfg.get("sync", "interval_minutes")
        )
        self.export_var = tk.StringVar(value=self.cfg.get("sync", "export_dir"))
        self.replace_var = tk.BooleanVar(
            value=self.cfg.getboolean("sync", "replace_all", fallback=True)
        )
        self.status_var = tk.StringVar(value="Idle")

        self._build_ui()
        self._on_source_change()
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        if self.cfg.getboolean("sync", "run_on_start", fallback=True):
            self.root.after(800, self._sync_now)
        self.root.after(1500, self._arm_timer)

    def _build_ui(self) -> None:
        pad = {"padx": 8, "pady": 3}
        frm = ttk.Frame(self.root, padding=10)
        frm.pack(fill=tk.BOTH, expand=True)

        ttk.Label(frm, text=APP_NAME, font=("Segoe UI", 14, "bold")).grid(
            row=0, column=0, columnspan=4, sticky="w"
        )
        ttk.Label(
            frm,
            text="For VFP6: run your export EXE/PRG → write files to export folder → upload to Render",
        ).grid(row=1, column=0, columnspan=4, sticky="w", pady=(0, 8))

        ttk.Label(frm, text="Data source").grid(row=2, column=0, sticky="w", **pad)
        self.source_combo = ttk.Combobox(
            frm,
            textvariable=self.source_var,
            values=list(SOURCE_LABELS.values()),
            state="readonly",
            width=36,
        )
        self.source_combo.grid(row=2, column=1, columnspan=2, sticky="w", **pad)
        self.source_combo.bind("<<ComboboxSelected>>", lambda _e: self._on_source_change())

        ttk.Label(frm, text="Cloud API").grid(row=3, column=0, sticky="w", **pad)
        ttk.Entry(frm, textvariable=self.api_var, width=42).grid(
            row=3, column=1, columnspan=3, sticky="ew", **pad
        )
        ttk.Label(frm, text="Cloud user").grid(row=4, column=0, sticky="w", **pad)
        ttk.Entry(frm, textvariable=self.user_var, width=24).grid(
            row=4, column=1, sticky="w", **pad
        )
        ttk.Label(frm, text="Password").grid(row=4, column=2, sticky="w", **pad)
        ttk.Entry(frm, textvariable=self.pass_var, show="*", width=18).grid(
            row=4, column=3, sticky="w", **pad
        )

        ttk.Separator(frm).grid(row=5, column=0, columnspan=4, sticky="ew", pady=6)

        # External / VFP block
        self.ext_frame = ttk.LabelFrame(frm, text="VFP / external export EXE", padding=8)
        self.ext_frame.grid(row=6, column=0, columnspan=4, sticky="ew", pady=4)
        ttk.Label(self.ext_frame, text="Command (EXE / BAT)").grid(
            row=0, column=0, sticky="w", **pad
        )
        ttk.Entry(self.ext_frame, textvariable=self.ext_cmd_var, width=48).grid(
            row=0, column=1, sticky="ew", **pad
        )
        ttk.Button(self.ext_frame, text="Browse…", command=self._browse_exe).grid(
            row=0, column=2, sticky="w", **pad
        )
        ttk.Label(self.ext_frame, text="Working folder").grid(
            row=1, column=0, sticky="w", **pad
        )
        ttk.Entry(self.ext_frame, textvariable=self.ext_work_var, width=48).grid(
            row=1, column=1, columnspan=2, sticky="ew", **pad
        )
        ttk.Label(
            self.ext_frame,
            text="EXE/PRG must write customers / products_stock / outstanding "
            "(.xlsx or .txt) into the export folder.",
            wraplength=620,
        ).grid(row=2, column=0, columnspan=3, sticky="w", **pad)
        self.ext_frame.columnconfigure(1, weight=1)

        # SQL block (optional)
        self.sql_frame = ttk.LabelFrame(frm, text="SQL Server (optional)", padding=8)
        self.sql_frame.grid(row=7, column=0, columnspan=4, sticky="ew", pady=4)
        ttk.Label(self.sql_frame, text="Server").grid(row=0, column=0, sticky="w", **pad)
        ttk.Entry(self.sql_frame, textvariable=self.sql_server_var, width=16).grid(
            row=0, column=1, sticky="w", **pad
        )
        ttk.Label(self.sql_frame, text="Database").grid(
            row=0, column=2, sticky="w", **pad
        )
        ttk.Entry(self.sql_frame, textvariable=self.sql_db_var, width=16).grid(
            row=0, column=3, sticky="w", **pad
        )
        ttk.Label(self.sql_frame, text="User").grid(row=1, column=0, sticky="w", **pad)
        ttk.Entry(self.sql_frame, textvariable=self.sql_user_var, width=16).grid(
            row=1, column=1, sticky="w", **pad
        )
        ttk.Label(self.sql_frame, text="Password").grid(
            row=1, column=2, sticky="w", **pad
        )
        ttk.Entry(
            self.sql_frame, textvariable=self.sql_pass_var, show="*", width=16
        ).grid(row=1, column=3, sticky="w", **pad)

        ttk.Label(frm, text="Export folder").grid(row=8, column=0, sticky="w", **pad)
        ttk.Entry(frm, textvariable=self.export_var).grid(
            row=8, column=1, columnspan=3, sticky="ew", **pad
        )

        ttk.Label(frm, text="Every (minutes)").grid(row=9, column=0, sticky="w", **pad)
        ttk.Entry(frm, textvariable=self.interval_var, width=8).grid(
            row=9, column=1, sticky="w", **pad
        )
        ttk.Checkbutton(
            frm,
            text="Replace all on cloud each upload",
            variable=self.replace_var,
        ).grid(row=9, column=2, columnspan=2, sticky="w", **pad)

        btns = ttk.Frame(frm)
        btns.grid(row=10, column=0, columnspan=4, sticky="ew", pady=8)
        ttk.Button(btns, text="Save settings", command=self._save).pack(
            side=tk.LEFT, padx=4
        )
        ttk.Button(btns, text="Sync now", command=self._sync_now).pack(
            side=tk.LEFT, padx=4
        )
        ttk.Button(
            btns, text="Install start with Windows", command=self._install
        ).pack(side=tk.LEFT, padx=4)
        ttk.Button(btns, text="Remove startup", command=self._uninstall).pack(
            side=tk.LEFT, padx=4
        )
        ttk.Button(btns, text="Open export folder", command=self._open_exports).pack(
            side=tk.LEFT, padx=4
        )
        ttk.Button(btns, text="Open VFP sample", command=self._open_vfp_sample).pack(
            side=tk.LEFT, padx=4
        )

        ttk.Label(frm, textvariable=self.status_var).grid(
            row=11, column=0, columnspan=4, sticky="w", **pad
        )

        self.log = scrolledtext.ScrolledText(frm, height=14, font=("Consolas", 9))
        self.log.grid(row=12, column=0, columnspan=4, sticky="nsew")
        frm.columnconfigure(1, weight=1)
        frm.rowconfigure(12, weight=1)

        installed = "Yes" if startup_installed() else "No"
        self._log(
            f"{APP_NAME} v{VERSION}\n"
            f"Startup task installed: {installed}\n"
            f"Config: {config_path()}\n"
            "Tip: Choose 'VFP / Run EXE', browse to your billing export EXE or BAT.\n"
        )

    def _on_source_change(self) -> None:
        key = LABEL_TO_SOURCE.get(self.source_var.get(), "external")
        if key == "sql":
            self.sql_frame.grid()
            self.ext_frame.grid_remove()
        elif key == "external":
            self.ext_frame.grid()
            self.sql_frame.grid_remove()
        else:
            self.ext_frame.grid_remove()
            self.sql_frame.grid_remove()

    def _browse_exe(self) -> None:
        path = filedialog.askopenfilename(
            title="Select export EXE or BAT",
            filetypes=[
                ("Programs", "*.exe;*.bat;*.cmd"),
                ("All", "*.*"),
            ],
        )
        if path:
            # Quote if spaces
            q = f'"{path}"' if " " in path and not path.startswith('"') else path
            self.ext_cmd_var.set(q)

    def _open_vfp_sample(self) -> None:
        for p in (
            app_dir() / "vfp",
            Path(getattr(sys, "_MEIPASS", "")) / "vfp",
            app_dir().parent / "autosync" / "vfp",
        ):
            if p and p.exists():
                os.startfile(p)
                return
        messagebox.showinfo(
            "VFP sample",
            "Sample PRG/BAT is under tools/autosync/vfp/ in the GenSoft Order project.",
        )

    def _log(self, text: str) -> None:
        self.log.insert(tk.END, text + ("" if text.endswith("\n") else "\n"))
        self.log.see(tk.END)

    def _persist_form(self) -> None:
        src = LABEL_TO_SOURCE.get(self.source_var.get(), "external")
        self.cfg["sync"]["source"] = src
        self.cfg["server"]["api_url"] = self.api_var.get().strip()
        self.cfg["login"]["username"] = self.user_var.get().strip()
        self.cfg["login"]["password"] = self.pass_var.get()
        self.cfg["sql"]["server"] = self.sql_server_var.get().strip()
        self.cfg["sql"]["database"] = self.sql_db_var.get().strip()
        self.cfg["sql"]["user"] = self.sql_user_var.get().strip()
        self.cfg["sql"]["password"] = self.sql_pass_var.get()
        self.cfg["external"]["command"] = self.ext_cmd_var.get().strip()
        self.cfg["external"]["working_dir"] = self.ext_work_var.get().strip()
        self.cfg["sync"]["export_dir"] = self.export_var.get().strip()
        self.cfg["sync"]["interval_minutes"] = self.interval_var.get().strip() or "60"
        self.cfg["sync"]["replace_all"] = "true" if self.replace_var.get() else "false"
        save_config(self.cfg)

    def _save(self) -> None:
        self._persist_form()
        messagebox.showinfo("Saved", f"Saved to:\n{config_path()}")

    def _open_exports(self) -> None:
        path = Path(self.export_var.get().strip() or ".")
        path.mkdir(parents=True, exist_ok=True)
        os.startfile(path)

    def _install(self) -> None:
        try:
            self._persist_form()
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
        self._persist_form()

        def work():
            try:
                self.root.after(0, lambda: self.status_var.set("Syncing…"))
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
    parser.add_argument("--once", action="store_true")
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

    AutoSyncApp().run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
