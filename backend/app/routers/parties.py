from io import BytesIO
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from ..deps import get_current_account
from ..excel_util import parse_excel_upload

router = APIRouter(prefix="/api/parties", tags=["parties"])

CUSTOMER_EXCEL_HEADERS = [
    "code",
    "name",
    "party_type",
    "address",
    "area",
    "city",
    "mobile",
    "dl_no",
    "gst_no",
    "sales_rep_name",
    "pricing_model",
]

CUSTOMER_SAMPLE_ROW = [
    "R003",
    "Apollo Pharmacy",
    "customer",
    "Main Road",
    "Ameerpet",
    "Hyderabad",
    "9876543210",
    "TS/HYD/20R-2003",
    "36APOLLO003Z1Z1",
    "M Naresh",
    "PTR",
]


@router.get("", response_model=List[schemas.Party])
def list_parties(
    search: Optional[str] = None,
    location: Optional[str] = None,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    return crud.get_parties(db, account, search, location)


@router.get("/upload/template")
def download_customer_template(
    account: models.Account = Depends(get_current_account),
):
    wb = Workbook()
    ws = wb.active
    ws.title = "Customers"
    ws.append(CUSTOMER_EXCEL_HEADERS)
    ws.append(CUSTOMER_SAMPLE_ROW)
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=gensoft_customers_template.xlsx"
        },
    )


@router.post("/upload", response_model=schemas.BulkUploadResult)
def upload_customers_json(
    data: schemas.CustomerUpload,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    try:
        return crud.upload_customers(db, account, data)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/upload/excel", response_model=schemas.BulkUploadResult)
async def upload_customers_excel(
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
        return crud.upload_customers_from_excel_rows(db, account, parsed)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{party_id}", response_model=schemas.Party)
def get_party(
    party_id: int,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    obj = crud.get_party(db, account, party_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Party not found")
    return obj


@router.post("", response_model=schemas.Party, status_code=201)
def create_party(
    data: schemas.PartyCreate,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    return crud.create_party(db, account, data)


@router.put("/{party_id}", response_model=schemas.Party)
def update_party(
    party_id: int,
    data: schemas.PartyUpdate,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    obj = crud.update_party(db, account, party_id, data)
    if not obj:
        raise HTTPException(status_code=404, detail="Party not found")
    return obj


@router.patch("/{party_id}/link", response_model=schemas.Party)
def link_party(
    party_id: int,
    data: schemas.PartyLink,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    try:
        obj = crud.link_party(db, account, party_id, data.linked_account_id)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not obj:
        raise HTTPException(status_code=404, detail="Party not found")
    return obj


@router.delete("/{party_id}", status_code=204)
def delete_party(
    party_id: int,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    if not crud.delete_party(db, account, party_id):
        raise HTTPException(status_code=404, detail="Party not found")
