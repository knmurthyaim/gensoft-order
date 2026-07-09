from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from ..deps import get_current_account

router = APIRouter(prefix="/api/connections", tags=["connections"])


@router.get("/outgoing", response_model=List[schemas.Connection])
def outgoing(
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    return crud.get_outgoing_connections(db, account)


@router.get("/incoming", response_model=List[schemas.Connection])
def incoming(
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    return crud.get_incoming_connections(db, account)


@router.post("", response_model=schemas.Connection, status_code=201)
def request_connection(
    data: schemas.ConnectionRequest,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    try:
        return crud.request_connection(db, account, data.supplier_account_id)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.patch("/{conn_id}/respond", response_model=schemas.Connection)
def respond(
    conn_id: int,
    payload: schemas.OrderStatusUpdate,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    try:
        obj = crud.respond_connection(db, account, conn_id, payload.status)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not obj:
        raise HTTPException(status_code=404, detail="Connection not found")
    return obj
