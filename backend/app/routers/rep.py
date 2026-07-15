from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/rep", tags=["sales-rep-app"])


def _require_rep(user: models.User) -> models.User:
    if user.role != "rep" or not user.sales_rep_id:
        raise HTTPException(status_code=403, detail="Sales rep access only")
    return user


def _mask_batch(batch_dict: dict, settings: schemas.DistributorSettings):
    if not settings.display_stock_to_salesrep:
        batch_dict["available_qty"] = None
        batch_dict["stock_hidden"] = True
    if settings.hide_scheme_from_salesrep:
        batch_dict["scheme"] = ""
        batch_dict["scheme_hidden"] = True
    return batch_dict


@router.get("/customers", response_model=List[schemas.Party])
def list_customers(
    search: Optional[str] = None,
    limit: int = Query(100, ge=1, le=200),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_rep(user)
    try:
        return crud.get_rep_customers(db, user, search, limit=limit)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/customers/{party_id}", response_model=schemas.Party)
def get_customer(
    party_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_rep(user)
    try:
        party = crud.get_rep_customer(db, user, party_id)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    return party


@router.get("/stock")
def list_stock(
    search: Optional[str] = None,
    limit: int = Query(100, ge=1, le=300),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_rep(user)
    try:
        rows, settings = crud.get_rep_stock(db, user, search=search, limit=limit)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    items = []
    for row in rows:
        product = schemas.Product.model_validate(row["product"]).model_dump()
        items.append(
            {
                "product": product,
                "available_qty": row["available_qty"],
                "stock_hidden": row["stock_hidden"],
                "scheme": row["scheme"] if not settings.hide_scheme_from_salesrep else "",
                "mrp": row["mrp"],
                "ptr_rate": row["ptr_rate"],
                "batch_count": row["batch_count"],
            }
        )
    return {"settings": settings, "items": items}


@router.get("/outstanding", response_model=schemas.OutstandingListResponse)
def list_outstanding(
    search: Optional[str] = None,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_rep(user)
    try:
        summary, rows = crud.get_rep_outstanding(db, user, search=search)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return schemas.OutstandingListResponse(summary=summary, rows=rows)


@router.get("/catalog")
def search_catalog(
    q: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=40),
    in_stock_only: bool = Query(False),
    first_word_exact: bool = Query(False),
    scheme_only: bool = Query(False),
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_rep(user)
    term = (q or search or "").strip()
    try:
        catalog, settings = crud.get_rep_catalog(
            db,
            user,
            search=term,
            limit=limit,
            in_stock_only=in_stock_only,
            first_word_exact=first_word_exact,
            scheme_only=scheme_only,
        )
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    items = []
    for entry in catalog:
        product = schemas.Product.model_validate(entry["product"]).model_dump()
        batches = []
        for b in entry["batches"]:
            if isinstance(b, dict):
                batch_dict = dict(b)
            else:
                batch_dict = schemas.StockBatch.model_validate(b).model_dump()
            batches.append(_mask_batch(batch_dict, settings))
        items.append({"product": product, "batches": batches})
    return {"settings": settings, "items": items, "query": term}


@router.post("/orders", response_model=schemas.Order, status_code=201)
def place_order(
    data: schemas.RepOrderCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_rep(user)
    try:
        return crud.create_rep_order(db, user, data)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/orders", response_model=List[schemas.Order])
def list_orders(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_rep(user)
    try:
        return crud.get_rep_orders(db, user)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/location-config", response_model=schemas.RepLocationConfig)
def location_config(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_rep(user)
    try:
        return crud.get_rep_location_config(db, user)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/location")
def post_location(
    data: schemas.RepLocationPing,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sales rep GPS ping. Stored only if distributor enabled tracking."""
    _require_rep(user)
    try:
        ping = crud.record_rep_location(db, user, data)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if ping is None:
        return {"accepted": False, "reason": "tracking_disabled"}
    return {
        "accepted": True,
        "id": ping.id,
        "recorded_at": ping.recorded_at,
    }


@router.post("/location/batch", response_model=schemas.RepLocationBatchResult)
def post_location_batch(
    data: schemas.RepLocationBatch,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload offline-queued GPS points when the phone comes online."""
    _require_rep(user)
    try:
        return crud.record_rep_locations_batch(db, user, data)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
