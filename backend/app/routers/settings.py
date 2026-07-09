from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from ..deps import get_current_account

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _require_distributor(account: models.Account):
    if account.account_type not in ("distributor", "sub_distributor"):
        raise HTTPException(
            status_code=403,
            detail="Settings are only available for distributors",
        )


@router.get("", response_model=schemas.DistributorSettings)
def get_settings(account: models.Account = Depends(get_current_account)):
    _require_distributor(account)
    return crud.get_distributor_settings(account)


@router.put("", response_model=schemas.DistributorSettings)
def update_settings(
    data: schemas.DistributorSettingsUpdate,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    _require_distributor(account)
    return crud.update_distributor_settings(db, account, data)
