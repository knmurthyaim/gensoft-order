from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from ..deps import get_current_account
from ..excel_util import parse_excel_upload

router = APIRouter(prefix="/api/outstanding", tags=["outstanding"])

OUTSTANDING_EXCEL_HEADERS = [
    "party_id",
    "party_name",
    "invoice_no",
    "invoice_date",
    "amount",
    "paid",
    "balance",
    "age",
    "discount",
]

OUTSTANDING_SAMPLE_ROW = [
    "R001",
    "Sri Dattha Central Pharmacy",
    "INV-24001",
    "2026-05-25",
    25000,
    8000,
    17000,
    45,
    0,
]


@router.get("", response_model=schemas.OutstandingListResponse)
def list_outstanding(
    search: Optional[str] = None,
    positive_only: bool = True,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    summary, rows = crud.get_outstanding(db, account, search, positive_only)
    return schemas.OutstandingListResponse(summary=summary, rows=rows)


@router.get("/upload/template")
def download_outstanding_template(
    account: models.Account = Depends(get_current_account),
):
    wb = Workbook()
    ws = wb.active
    ws.title = "Outstanding"
    ws.append(OUTSTANDING_EXCEL_HEADERS)
    ws.append(OUTSTANDING_SAMPLE_ROW)
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=gensoft_outstanding_template.xlsx"
        },
    )


@router.post("/upload", response_model=schemas.OutstandingBillUploadResult)
def upload_outstanding_json(
    data: schemas.OutstandingBillUpload,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    try:
        return crud.upload_outstanding_bills(db, account, data)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/upload/excel", response_model=schemas.OutstandingBillUploadResult)
async def upload_outstanding_excel(
    file: UploadFile = File(...),
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx)")
    content = await file.read()
    try:
        parsed = parse_excel_upload(content)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read Excel file")
    if not parsed:
        raise HTTPException(status_code=400, detail="No data rows found in Excel file")
    try:
        return crud.upload_outstanding_from_excel_rows(db, account, parsed)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
