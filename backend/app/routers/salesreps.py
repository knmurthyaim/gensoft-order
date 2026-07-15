from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from ..deps import get_current_account

router = APIRouter(prefix="/api/sales-reps", tags=["sales-reps"])


def _require_distributor(account: models.Account):
    if account.account_type not in ("distributor", "sub_distributor", "stockist"):
        raise HTTPException(
            status_code=403,
            detail="Sales rep location is only available for distributors",
        )


@router.get("", response_model=List[schemas.SalesRep])
def list_reps(
    search: Optional[str] = None,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    return crud.get_sales_reps(db, account, search)


@router.get("/locations/latest", response_model=List[schemas.SalesRepLocationLatest])
def locations_latest(
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    """Distributor-only: last known position per sales rep (max 7 days)."""
    _require_distributor(account)
    try:
        return crud.get_sales_rep_locations_latest(db, account)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get(
    "/{rep_id}/locations",
    response_model=List[schemas.SalesRepLocationPoint],
)
def location_trail(
    rep_id: int,
    limit: int = Query(200, ge=1, le=500),
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    """Distributor-only: location trail for one rep (last 7 days)."""
    _require_distributor(account)
    try:
        return crud.get_sales_rep_location_trail(db, account, rep_id, limit=limit)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("", response_model=schemas.SalesRep, status_code=201)
def create_rep(
    data: schemas.SalesRepCreate,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    try:
        return crud.create_sales_rep(db, account, data)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/{rep_id}", response_model=schemas.SalesRep)
def update_rep(
    rep_id: int,
    data: schemas.SalesRepUpdate,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    try:
        obj = crud.update_sales_rep(db, account, rep_id, data)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
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
