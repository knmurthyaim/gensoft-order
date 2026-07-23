from io import BytesIO
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
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
    date(2026, 5, 25),  # real Excel date — age = days from this date
    25000,
    8000,
    17000,
    "",  # age left blank — calculated from invoice_date
    0,
]


@router.get("", response_model=schemas.OutstandingListResponse)
def list_outstanding(
    search: Optional[str] = None,
    positive_only: bool = True,
    limit: int = Query(25, ge=1, le=100),
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    summary, rows = crud.get_outstanding(db, account, search, positive_only, limit)
    return schemas.OutstandingListResponse(summary=summary, rows=rows)


@router.get("/parties", response_model=schemas.OutstandingPartyListResponse)
def list_outstanding_parties(
    search: Optional[str] = None,
    positive_only: bool = True,
    limit: int = Query(25, ge=1, le=100),
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    """Party-wise outstanding summary (code, name, place, bills, balance)."""
    return crud.get_outstanding_parties(
        db, account, search=search, positive_only=positive_only, limit=limit
    )


@router.get("/bills", response_model=schemas.OutstandingListResponse)
def list_outstanding_party_bills(
    party_id: str = "",
    party_name: str = "",
    positive_only: bool = True,
    limit: int = Query(500, ge=1, le=1000),
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    """Bill-wise outstanding for one party."""
    try:
        summary, rows = crud.get_outstanding_party_bills(
            db,
            account,
            party_id=party_id,
            party_name=party_name,
            positive_only=positive_only,
            limit=limit,
        )
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
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
    for row in ws.iter_rows(min_row=2, min_col=4, max_col=4):
        for cell in row:
            cell.number_format = "DD-MM-YYYY"
    ws.append([])
    ws.append(
        [
            "NOTE:",
            "invoice_date required for auto age (Excel Date or DD-MM-YYYY). Leave age blank — calculated as days since invoice_date.",
        ]
    )
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
    replace_all: bool = Query(False),
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Please upload an Excel file (.xlsx or .xls)")
    content = await file.read()
    try:
        parsed = parse_excel_upload(content)
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read Excel file")
    if not parsed:
        raise HTTPException(status_code=400, detail="No data rows found in Excel file")
    try:
        return crud.upload_outstanding_from_excel_rows(
            db, account, parsed, replace_all=replace_all
        )
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=400, detail=f"Outstanding upload failed: {exc}"
        ) from exc
