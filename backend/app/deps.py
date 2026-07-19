from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .security import decode_access_token


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> models.User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if payload.get("scope") == "rep_tracking":
        raise HTTPException(status_code=401, detail="Tracking token cannot access this endpoint")
    user = (
        db.query(models.User)
        .filter(models.User.id == int(payload["sub"]))
        .first()
    )
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def get_location_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> models.User:
    """Authenticate normal app tokens or restricted native tracking tokens."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.query(models.User).filter(models.User.id == int(payload["sub"])).first()
    if not user or not user.is_active or user.role != "rep":
        raise HTTPException(status_code=401, detail="Active sales rep required")
    return user


def get_current_account(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.Account:
    if user.role == "platform_admin":
        raise HTTPException(
            status_code=400, detail="Platform admin is not scoped to an account"
        )
    if not user.account_id:
        raise HTTPException(status_code=400, detail="User has no account")
    account = (
        db.query(models.Account)
        .filter(models.Account.id == user.account_id)
        .first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


def require_platform_admin(
    user: models.User = Depends(get_current_user),
) -> models.User:
    if user.role != "platform_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return user
