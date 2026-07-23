from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import crud, models, schemas
from ..database import get_db
from ..deps import get_current_user
from ..security import create_access_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _login_blocked_message(user: models.User, db: Session) -> str | None:
    if not user.is_active:
        return "Account disabled"
    if user.role == "platform_admin" or not user.account_id:
        return None
    account = (
        db.query(models.Account).filter(models.Account.id == user.account_id).first()
    )
    if not account:
        return "Account not found"
    status = getattr(account, "approval_status", "approved") or "approved"
    if status == "pending":
        return (
            "Your registration is pending Super Admin approval. "
            "You will be able to sign in after approval."
        )
    if status == "rejected":
        reason = (account.rejection_reason or "").strip()
        if reason:
            return f"Registration was rejected: {reason}"
        return "Registration was rejected by Super Admin."
    if not account.is_active:
        return "Account disabled"
    return None


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
    blocked = _login_blocked_message(user, db)
    if blocked:
        raise HTTPException(status_code=403, detail=blocked)
    # Sales reps stay signed in until they tap Logout (long-lived token).
    # Other roles keep the default shorter session.
    expires = (60 * 24 * 365) if user.role == "rep" else None
    token = create_access_token(
        {"sub": str(user.id), "role": user.role},
        expires_minutes=expires,
    )
    return schemas.Token(access_token=token)


@router.post("/register", response_model=schemas.SignupResponse, status_code=201)
async def register(
    account_type: str = Form("retailer"),
    name: str = Form(...),
    owner_name: str = Form(""),
    address: str = Form(""),
    area: str = Form(""),
    city: str = Form("Hyderabad"),
    mobile: str = Form(...),
    dl_no: str = Form(""),
    gst_no: str = Form(""),
    email: str = Form(""),
    username: str = Form(...),
    password: str = Form(...),
    notes: str = Form(""),
    files: List[UploadFile] = File(default=[]),
    doc_types: List[str] = Form(default=[]),
    db: Session = Depends(get_db),
):
    """Public self-signup. Creates a pending account for Super Admin approval."""
    data = schemas.RegisterRequest(
        account_type=account_type,
        name=name,
        owner_name=owner_name,
        address=address,
        area=area,
        city=city,
        mobile=mobile,
        dl_no=dl_no,
        gst_no=gst_no,
        email=email,
        username=username,
        password=password,
    )
    blobs = []
    upload_list = files or []
    type_list = doc_types or []
    for idx, f in enumerate(upload_list):
        if not f or not f.filename:
            continue
        content = await f.read()
        blobs.append(
            {
                "filename": f.filename,
                "content_type": f.content_type or "application/octet-stream",
                "content": content,
                "doc_type": type_list[idx] if idx < len(type_list) else "other",
            }
        )
    try:
        account, _user = crud.public_signup(db, data, file_blobs=blobs, notes=notes)
    except crud.AppError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return schemas.SignupResponse(
        status="pending",
        message=(
            "Registration submitted. Super Admin will review your details "
            "and attachments. You can sign in after approval."
        ),
        gensoft_code=account.gensoft_code,
        account_id=account.id,
    )


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
