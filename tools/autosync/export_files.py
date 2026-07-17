"""Discover / convert export files for GenSoft Order upload."""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Callable

from openpyxl import Workbook

LogFn = Callable[[str], None]

# upload_type -> preferred filenames (first match wins)
FILE_CANDIDATES = {
    "customers": [
        "customers.xlsx",
        "customers.xls",
        "customers.csv",
        "customers.tsv",
        "customers.txt",
        "parties.xlsx",
        "parties.csv",
        "parties.txt",
    ],
    "products": [
        "products_stock.xlsx",
        "products_stock.csv",
        "products_stock.tsv",
        "products_stock.txt",
        "products.xlsx",
        "products.csv",
        "products.tsv",
        "products.txt",
        "stock.xlsx",
        "stock.csv",
        "stock.txt",
    ],
    "outstanding": [
        "outstanding.xlsx",
        "outstanding.csv",
        "outstanding.tsv",
        "outstanding.txt",
        "bills.xlsx",
        "bills.csv",
        "bills.txt",
    ],
}


def _log(log: LogFn | None, msg: str) -> None:
    if log:
        log(msg)


def _sniff_delimiter(sample: str) -> str:
    if "\t" in sample:
        return "\t"
    if sample.count(";") > sample.count(","):
        return ";"
    if sample.count("|") > sample.count(","):
        return "|"
    return ","


def delimited_to_xlsx(src: Path, dest: Path) -> Path:
    text = src.read_text(encoding="utf-8-sig", errors="replace")
    if not text.strip():
        raise RuntimeError(f"Empty file: {src}")
    first = text.splitlines()[0] if text.splitlines() else ""
    delim = _sniff_delimiter(first)
    reader = csv.reader(text.splitlines(), delimiter=delim)
    rows = list(reader)
    if not rows:
        raise RuntimeError(f"No rows in {src}")

    wb = Workbook()
    ws = wb.active
    ws.title = dest.stem[:31] or "Sheet1"
    for row in rows:
        ws.append(row)
    dest.parent.mkdir(parents=True, exist_ok=True)
    wb.save(dest)
    return dest


def resolve_export_files(
    export_dir: Path,
    sync_types: str,
    log: LogFn | None = None,
) -> dict[str, Path]:
    """
    Find customers/products/outstanding files in export_dir.
    Converts .csv/.tsv/.txt to .xlsx beside them when needed.
    """
    export_dir.mkdir(parents=True, exist_ok=True)
    wanted = {
        k.strip().lower()
        for k in (sync_types or "customers,products,outstanding").split(",")
        if k.strip()
    }
    found: dict[str, Path] = {}

    for utype in ("customers", "products", "outstanding"):
        if utype not in wanted:
            continue
        hit: Path | None = None
        for name in FILE_CANDIDATES[utype]:
            p = export_dir / name
            if p.is_file():
                hit = p
                break
        if not hit:
            _log(log, f"Missing file for {utype} in {export_dir}")
            continue
        if hit.suffix.lower() in (".csv", ".tsv", ".txt"):
            xlsx = hit.with_suffix(".xlsx")
            _log(log, f"Converting {hit.name} → {xlsx.name}")
            delimited_to_xlsx(hit, xlsx)
            found[utype] = xlsx
        else:
            found[utype] = hit
            _log(log, f"Using {hit.name} for {utype}")

    return found


def run_external_export(
    command: str,
    working_dir: str | Path,
    timeout_sec: int = 600,
    log: LogFn | None = None,
) -> None:
    """Run VFP-built EXE / BAT / CMD that writes export files."""
    import subprocess

    cmd = (command or "").strip()
    if not cmd:
        raise RuntimeError(
            "No export command configured. "
            "Set [external] command to your VFP EXE or BAT that creates the Excel/CSV files."
        )
    cwd = Path(working_dir) if working_dir else Path.cwd()
    cwd.mkdir(parents=True, exist_ok=True)
    _log(log, f"Running export: {cmd}")
    _log(log, f"Working folder: {cwd}")
    result = subprocess.run(
        cmd,
        shell=True,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        timeout=max(30, int(timeout_sec or 600)),
    )
    if result.stdout:
        _log(log, result.stdout.strip()[-2000:])
    if result.stderr:
        _log(log, result.stderr.strip()[-1000:])
    if result.returncode != 0:
        raise RuntimeError(
            f"Export command failed (exit {result.returncode}). "
            "Check the EXE/PRG path and that it writes files into the export folder."
        )
    _log(log, "Export command finished OK")
