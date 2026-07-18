"""Async Excel sync API — accept upload fast, process in background."""

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from .. import crud, models, schemas, sync_worker
from ..database import get_db
from ..deps import get_current_account

router = APIRouter(prefix="/api/sync", tags=["sync"])

TYPE_ALIASES = {
    "customers": "customers",
    "parties": "customers",
    "products": "products",
    "stock": "products",
    "outstanding": "outstanding",
    "bills": "outstanding",
}


@router.post("/upload/excel", response_model=schemas.SyncJobAccepted, status_code=202)
async def enqueue_excel_upload(
    file: UploadFile = File(...),
    upload_type: str = Query(..., description="customers | products | outstanding"),
    replace_all: bool = Query(True),
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    """Accept Excel and return immediately. Poll GET /api/sync/jobs/{id} for result."""
    name = (file.filename or "").lower()
    if not name.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=400, detail="Please upload an Excel file (.xlsx or .xls)"
        )
    kind = TYPE_ALIASES.get((upload_type or "").strip().lower())
    if not kind:
        raise HTTPException(
            status_code=400,
            detail="upload_type must be customers, products, or outstanding",
        )
    content = await file.read()
    try:
        job = sync_worker.enqueue_excel_job(
            db,
            account,
            kind,
            file.filename or "upload.xlsx",
            content,
            replace_all=replace_all,
        )
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Ensure worker is running (idempotent)
    sync_worker.start_sync_worker()

    return schemas.SyncJobAccepted(
        job_id=job.id,
        status=job.status,
        upload_type=job.upload_type,
        message="Upload accepted — processing in background. Website stays available.",
    )


@router.get("/jobs/{job_id}", response_model=schemas.SyncJobStatus)
def get_sync_job(
    job_id: int,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    job = sync_worker.get_job_for_account(db, account.id, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Sync job not found")
    return sync_worker.job_to_status(job)


@router.get("/jobs", response_model=list[schemas.SyncJobStatus])
def list_recent_sync_jobs(
    limit: int = Query(20, ge=1, le=100),
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(models.SyncJob)
        .filter(models.SyncJob.account_id == account.id)
        .order_by(models.SyncJob.id.desc())
        .limit(limit)
        .all()
    )
    return [sync_worker.job_to_status(j) for j in rows]
