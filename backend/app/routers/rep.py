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
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_rep(user)
    try:
        return crud.get_rep_customers(db, user, search)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/catalog")
def search_catalog(
    q: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(40, ge=1, le=100),
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
        batches = [
            _mask_batch(schemas.StockBatch.model_validate(b).model_dump(), settings)
            for b in entry["batches"]
        ]
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
