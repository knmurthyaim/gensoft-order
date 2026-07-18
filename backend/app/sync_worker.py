"""Background Excel sync worker — process uploads off the request thread."""

from __future__ import annotations

import json
import os
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

from . import crud, models, schemas
from .database import SessionLocal
from .excel_util import parse_excel_upload
from .models import utcnow

UPLOAD_TYPES = ("customers", "products", "outstanding")

_worker_started = False
_worker_lock = threading.Lock()


def upload_dir() -> Path:
    path = Path(os.getenv("SYNC_UPLOAD_DIR", "sync_uploads"))
    path.mkdir(parents=True, exist_ok=True)
    return path


def enqueue_excel_job(
    db: Session,
    account: models.Account,
    upload_type: str,
    filename: str,
    content: bytes,
    replace_all: bool = True,
) -> models.SyncJob:
    if account.account_type not in ("distributor", "sub_distributor", "stockist"):
        raise crud.AppError("Only distributors can upload sync data")
    if upload_type not in UPLOAD_TYPES:
        raise crud.AppError(f"Unknown upload type: {upload_type}")
    if not content:
        raise crud.AppError("Empty file")

    safe_name = Path(filename or "upload.xlsx").name
    stored = upload_dir() / f"{account.id}_{uuid.uuid4().hex}_{safe_name}"
    stored.write_bytes(content)

    job = models.SyncJob(
        account_id=account.id,
        upload_type=upload_type,
        status="pending",
        replace_all=bool(replace_all),
        original_filename=safe_name,
        file_path=str(stored),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_job_for_account(
    db: Session, account_id: int, job_id: int
) -> Optional[models.SyncJob]:
    return (
        db.query(models.SyncJob)
        .filter(
            models.SyncJob.id == job_id,
            models.SyncJob.account_id == account_id,
        )
        .first()
    )


def job_to_status(job: models.SyncJob) -> schemas.SyncJobStatus:
    created = uploaded = failed = skipped = 0
    errors: list[str] = []
    if job.result_json:
        try:
            data = json.loads(job.result_json)
            created = int(data.get("created", 0) or 0)
            uploaded = int(data.get("uploaded", data.get("created", 0)) or 0)
            failed = int(data.get("failed", 0) or 0)
            skipped = int(data.get("skipped", 0) or 0)
            errors = list(data.get("errors") or [])
        except Exception:
            pass
    return schemas.SyncJobStatus(
        job_id=job.id,
        upload_type=job.upload_type,
        status=job.status,
        replace_all=bool(job.replace_all),
        original_filename=job.original_filename or "",
        created=created,
        uploaded=uploaded,
        failed=failed,
        skipped=skipped,
        errors=errors,
        error=job.error or "",
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
    )


def _claim_next_job(db: Session) -> Optional[models.SyncJob]:
    job = (
        db.query(models.SyncJob)
        .filter(models.SyncJob.status == "pending")
        .order_by(models.SyncJob.id.asc())
        .first()
    )
    if not job:
        return None
    # Optimistic claim — only one worker wins
    updated = (
        db.query(models.SyncJob)
        .filter(
            models.SyncJob.id == job.id,
            models.SyncJob.status == "pending",
        )
        .update(
            {
                "status": "processing",
                "started_at": utcnow(),
            },
            synchronize_session=False,
        )
    )
    db.commit()
    if not updated:
        return None
    return db.query(models.SyncJob).filter(models.SyncJob.id == job.id).first()


def _run_job(job_id: int) -> None:
    db = SessionLocal()
    path: Optional[Path] = None
    try:
        job = db.query(models.SyncJob).filter(models.SyncJob.id == job_id).first()
        if not job:
            return
        account = (
            db.query(models.Account)
            .filter(models.Account.id == job.account_id)
            .first()
        )
        if not account:
            job.status = "failed"
            job.error = "Account not found"
            job.finished_at = utcnow()
            db.commit()
            return

        path = Path(job.file_path) if job.file_path else None
        if not path or not path.is_file():
            job.status = "failed"
            job.error = "Upload file missing on server"
            job.finished_at = utcnow()
            db.commit()
            return

        content = path.read_bytes()
        parsed = parse_excel_upload(content)
        if not parsed:
            raise crud.AppError("No data rows found in Excel file")

        if job.upload_type == "customers":
            result = crud.upload_customers_from_excel_rows(
                db, account, parsed, replace_all=job.replace_all
            )
        elif job.upload_type == "products":
            result = crud.upload_products_from_excel_rows(
                db, account, parsed, replace_all=job.replace_all
            )
        elif job.upload_type == "outstanding":
            result = crud.upload_outstanding_from_excel_rows(
                db, account, parsed, replace_all=job.replace_all
            )
        else:
            raise crud.AppError(f"Unknown upload type: {job.upload_type}")

        # Re-load job (upload_* commits its own session state)
        job = db.query(models.SyncJob).filter(models.SyncJob.id == job_id).first()
        if not job:
            return
        job.result_json = result.model_dump_json()
        job.status = "completed"
        job.error = ""
        job.finished_at = utcnow()
        db.commit()
    except Exception as exc:
        try:
            db.rollback()
        except Exception:
            pass
        try:
            job = db.query(models.SyncJob).filter(models.SyncJob.id == job_id).first()
            if job:
                job.status = "failed"
                job.error = str(exc)[:2000]
                job.finished_at = utcnow()
                db.commit()
        except Exception:
            pass
    finally:
        if path and path.is_file():
            try:
                path.unlink()
            except OSError:
                pass
        db.close()


def _worker_loop() -> None:
    while True:
        try:
            db = SessionLocal()
            try:
                job = _claim_next_job(db)
            finally:
                db.close()
            if job:
                _run_job(job.id)
            else:
                time.sleep(1.5)
        except Exception:
            time.sleep(3)


def start_sync_worker() -> None:
    """Start one background thread per process (safe to call multiple times)."""
    global _worker_started
    with _worker_lock:
        if _worker_started:
            return
        _worker_started = True
        t = threading.Thread(target=_worker_loop, name="gensoft-sync-worker", daemon=True)
        t.start()
