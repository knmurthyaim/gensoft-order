from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from ..deps import get_current_user
from ..security import create_access_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=schemas.Token)
def login(data: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == data.username).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return schemas.Token(access_token=token)


@router.post("/change-password")
def change_password(
    data: schemas.ChangePasswordRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        crud.change_password(db, user, data.current_password, data.new_password)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "ok", "message": "Password changed successfully"}


@router.get("/me", response_model=schemas.Me)
def me(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    account = None
    if user.account_id:
        account = (
            db.query(models.Account)
            .filter(models.Account.id == user.account_id)
            .first()
        )
    return schemas.Me(user=user, account=account)
