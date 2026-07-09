from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from ..deps import get_current_account

router = APIRouter(prefix="/api/orders", tags=["orders"])


@router.get("/summary", response_model=schemas.OrderSummary)
def orders_summary(
    direction: str = Query("received"),
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    return crud.get_orders_summary(db, account, direction)


@router.get("", response_model=List[schemas.Order])
def list_orders(
    direction: str = Query("received", description="received | placed | all"),
    statuses: Optional[str] = Query(None),
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    status_list = [s.strip() for s in statuses.split(",")] if statuses else None
    return crud.get_orders(db, account, direction, status_list)


@router.get("/{order_id}", response_model=schemas.Order)
def get_order(
    order_id: int,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    obj = crud.get_order(db, account, order_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Order not found")
    return obj


@router.post("", response_model=schemas.Order, status_code=201)
def create_order(
    data: schemas.OrderCreate,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    try:
        return crud.create_order(db, account, data)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.patch("/{order_id}/status", response_model=schemas.Order)
def update_status(
    order_id: int,
    payload: schemas.OrderStatusUpdate,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    try:
        obj = crud.update_order_status(
            db, account, order_id, payload.status, payload.remarks
        )
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not obj:
        raise HTTPException(status_code=404, detail="Order not found")
    return obj


@router.delete("/{order_id}", status_code=204)
def delete_order(
    order_id: int,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    if not crud.delete_order(db, account, order_id):
        raise HTTPException(status_code=404, detail="Order not found")
