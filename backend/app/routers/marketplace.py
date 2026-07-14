from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from ..deps import get_current_account

router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])


def _mask_for_party(batch_dict: dict, settings: schemas.DistributorSettings):
    if not settings.display_stock_to_parties:
        batch_dict["available_qty"] = None
        batch_dict["stock_hidden"] = True
    if settings.hide_scheme_from_parties:
        batch_dict["scheme"] = ""
        batch_dict["scheme_hidden"] = True
    return batch_dict


def _serialize_catalog(catalog, settings):
    result = []
    for entry in catalog:
        product = schemas.Product.model_validate(entry["product"]).model_dump()
        batches = []
        for b in entry["batches"]:
            bd = schemas.StockBatch.model_validate(b).model_dump()
            batches.append(_mask_for_party(bd, settings))
        result.append({"product": product, "batches": batches})
    return result


@router.get("/suppliers/{supplier_account_id}/catalog")
def supplier_catalog(
    supplier_account_id: int,
    q: Optional[str] = Query(None, description="Product search text"),
    search: Optional[str] = Query(None, description="Alias for q"),
    limit: int = Query(40, ge=1, le=100),
    in_stock_only: bool = Query(False),
    first_word_exact: bool = Query(False),
    scheme_only: bool = Query(False),
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    """Search visible products from a connected supplier (no full catalog dump)."""
    try:
        supplier = crud.get_supplier_for_catalog(db, account, supplier_account_id)
        term = (q or search or "").strip()
        catalog = crud.get_supplier_catalog(
            db,
            account,
            supplier_account_id,
            search=term,
            limit=limit,
            in_stock_only=in_stock_only,
            first_word_exact=first_word_exact,
            scheme_only=scheme_only,
        )
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    settings = crud.get_distributor_settings(supplier)
    return {
        "settings": settings,
        "items": _serialize_catalog(catalog, settings),
        "notice": crud._no_order_notice(supplier),
        "query": term,
    }


@router.get("/products/search")
def search_products_across_suppliers(
    q: Optional[str] = Query(None, description="Product search text"),
    search: Optional[str] = Query(None, description="Alias for q"),
    limit: int = Query(40, ge=1, le=100),
    in_stock_only: bool = Query(False),
    first_word_exact: bool = Query(False),
    scheme_only: bool = Query(False),
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    """Find which connected distributors have a product (By Product search)."""
    term = (q or search or "").strip()
    try:
        rows = crud.search_products_across_suppliers(
            db,
            account,
            search=term,
            limit=limit,
            in_stock_only=in_stock_only,
            first_word_exact=first_word_exact,
            scheme_only=scheme_only,
        )
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    items = []
    for entry in rows:
        supplier = entry["supplier"]
        settings = entry["settings"]
        product = schemas.Product.model_validate(entry["product"]).model_dump()
        batches = [
            _mask_for_party(schemas.StockBatch.model_validate(b).model_dump(), settings)
            for b in entry["batches"]
        ]
        items.append(
            {
                "product": product,
                "batches": batches,
                "settings": settings,
                "supplier": {
                    "id": supplier.id,
                    "name": supplier.name,
                    "gensoft_code": supplier.gensoft_code,
                    "city": supplier.city or "",
                    "area": supplier.area or "",
                },
                "notice": crud._no_order_notice(supplier),
            }
        )
    return {"items": items, "query": term}
