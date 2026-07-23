from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from ..deps import get_current_user
from ..security import create_access_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=schemas.Token)
def login(data: schemas.LoginRequest, db: Session = Depends(get_db)):
    raw = (data.username or "").strip()
    user = db.query(models.User).filter(models.User.username == raw).first()
    if not user:
        # Sales reps log in with phone number (digits / with spaces or +91)
        phone = crud.normalize_phone(raw)
        if phone:
            user = (
                db.query(models.User)
                .filter(models.User.username == phone, models.User.role == "rep")
                .first()
            )
        # Also allow login by sales-rep name when it uniquely matches
        if not user and raw and (not phone or len(phone) < 10):
            reps = (
                db.query(models.SalesRep)
                .filter(models.SalesRep.name.ilike(raw.strip()))
                .all()
            )
            if len(reps) == 1:
                user = (
                    db.query(models.User)
                    .filter(models.User.sales_rep_id == reps[0].id)
                    .first()
                )
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
    sales_rep = None
    if user.account_id:
        account = (
            db.query(models.Account)
            .filter(models.Account.id == user.account_id)
            .first()
        )
    if user.sales_rep_id:
        sales_rep = (
            db.query(models.SalesRep)
            .filter(models.SalesRep.id == user.sales_rep_id)
            .first()
        )
    return schemas.Me(user=user, account=account, sales_rep=sales_rep)
