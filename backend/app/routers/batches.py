from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from ..deps import get_current_account

router = APIRouter(prefix="/api/batches", tags=["stock-batches"])


@router.get("", response_model=List[schemas.StockBatch])
def list_batches(
    product_id: Optional[int] = None,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    return crud.get_batches(db, account, product_id)


@router.post("", response_model=schemas.StockBatch, status_code=201)
def create_batch(
    data: schemas.StockBatchCreate,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    try:
        return crud.create_batch(db, account, data)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/{batch_id}", response_model=schemas.StockBatch)
def update_batch(
    batch_id: int,
    data: schemas.StockBatchUpdate,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    obj = crud.update_batch(db, account, batch_id, data)
    if not obj:
        raise HTTPException(status_code=404, detail="Batch not found")
    return obj


@router.delete("/{batch_id}", status_code=204)
def delete_batch(
    batch_id: int,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    if not crud.delete_batch(db, account, batch_id):
        raise HTTPException(status_code=404, detail="Batch not found")
