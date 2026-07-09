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

router = APIRouter(prefix="/api/products", tags=["products"])

PRODUCT_EXCEL_HEADERS = [
    "product_code",
    "name",
    "manufacturer",
    "pack_size",
    "hsn_code",
    "category",
    "mrp",
    "ptr_rate",
    "pts_rate",
    "gst_pct",
    "batch_no",
    "expiry_date",
    "available_qty",
    "scheme",
    "batch_mrp",
    "batch_ptr_rate",
]

PRODUCT_SAMPLE_ROW = [
    "P1001",
    "Dolo 650mg Tab",
    "Micro Labs",
    "15s",
    "30049099",
    "Analgesic",
    32.5,
    28.0,
    25.0,
    12,
    "DL2401",
    "2027-06-30",
    500,
    "10+1",
    32.5,
    28.0,
]


@router.get("", response_model=List[schemas.Product])
def list_products(
    search: Optional[str] = None,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    return crud.get_products(db, account, search)


@router.get("/upload/template")
def download_product_template(
    account: models.Account = Depends(get_current_account),
):
    wb = Workbook()
    ws = wb.active
    ws.title = "Products"
    ws.append(PRODUCT_EXCEL_HEADERS)
    ws.append(PRODUCT_SAMPLE_ROW)
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": "attachment; filename=gensoft_products_stock_template.xlsx"
        },
    )


@router.post("/upload", response_model=schemas.BulkUploadResult)
def upload_products_json(
    data: schemas.ProductStockUpload,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    try:
        return crud.upload_products_with_stock(db, account, data)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/upload/excel", response_model=schemas.BulkUploadResult)
async def upload_products_excel(
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
        return crud.upload_products_from_excel_rows(db, account, parsed)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{product_id}", response_model=schemas.Product)
def get_product(
    product_id: int,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    obj = crud.get_product(db, account, product_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Product not found")
    return obj


@router.post("", response_model=schemas.Product, status_code=201)
def create_product(
    data: schemas.ProductCreate,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    return crud.create_product(db, account, data)


@router.put("/{product_id}", response_model=schemas.Product)
def update_product(
    product_id: int,
    data: schemas.ProductUpdate,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    obj = crud.update_product(db, account, product_id, data)
    if not obj:
        raise HTTPException(status_code=404, detail="Product not found")
    return obj


@router.delete("/{product_id}", status_code=204)
def delete_product(
    product_id: int,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    if not crud.delete_product(db, account, product_id):
        raise HTTPException(status_code=404, detail="Product not found")
