from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from ..deps import get_current_account

router = APIRouter(prefix="/api/sales-reps", tags=["sales-reps"])


@router.get("", response_model=List[schemas.SalesRep])
def list_reps(
    search: Optional[str] = None,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    return crud.get_sales_reps(db, account, search)


@router.post("", response_model=schemas.SalesRep, status_code=201)
def create_rep(
    data: schemas.SalesRepCreate,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    return crud.create_sales_rep(db, account, data)


@router.put("/{rep_id}", response_model=schemas.SalesRep)
def update_rep(
    rep_id: int,
    data: schemas.SalesRepUpdate,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    obj = crud.update_sales_rep(db, account, rep_id, data)
    if not obj:
        raise HTTPException(status_code=404, detail="Sales rep not found")
    return obj


@router.delete("/{rep_id}", status_code=204)
def delete_rep(
    rep_id: int,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    if not crud.delete_sales_rep(db, account, rep_id):
        raise HTTPException(status_code=404, detail="Sales rep not found")
