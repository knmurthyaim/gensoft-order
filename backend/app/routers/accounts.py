from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from ..deps import get_current_account

router = APIRouter(prefix="/api", tags=["account"])


@router.get("/account", response_model=schemas.Account)
def my_account(account: models.Account = Depends(get_current_account)):
    return account


@router.put("/account", response_model=schemas.Account)
def update_my_account(
    data: schemas.AccountUpdate,
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    return crud.update_account(db, account, data)


@router.get("/directory", response_model=List[schemas.DirectoryAccount])
def directory(
    search: Optional[str] = None,
    account_type: Optional[str] = "all",
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    return crud.get_directory(db, account, search, account_type)


@router.get("/dashboard", response_model=schemas.DashboardStats)
def dashboard(
    account: models.Account = Depends(get_current_account),
    db: Session = Depends(get_db),
):
    return crud.get_dashboard_stats(db, account)
