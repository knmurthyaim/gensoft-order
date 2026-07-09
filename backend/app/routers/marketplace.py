from fastapi import APIRouter, Depends, HTTPException
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


@router.get("/suppliers/{supplier_account_id}/catalog")
def supplier_catalog(
    supplier_account_id: int,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    """Visible products + batches from a connected supplier."""
    try:
        catalog = crud.get_supplier_catalog(db, account, supplier_account_id)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    supplier = (
        db.query(models.Account)
        .filter(models.Account.id == supplier_account_id)
        .first()
    )
    settings = (
        catalog[0]["settings"]
        if catalog
        else crud.get_distributor_settings(supplier)
    )

    result = []
    for entry in catalog:
        product = schemas.Product.model_validate(entry["product"]).model_dump()
        batches = []
        for b in entry["batches"]:
            bd = schemas.StockBatch.model_validate(b).model_dump()
            batches.append(_mask_for_party(bd, settings))
        result.append({"product": product, "batches": batches})

    return {
        "settings": settings,
        "items": result,
        "notice": crud._no_order_notice(supplier) if supplier else None,
    }
