from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from .database import Base, engine, migrate_db
from .routers import (
    accounts,
    admin,
    auth,
    batches,
    connections,
    marketplace,
    orders,
    outstanding,
    parties,
    products,
    rep,
    salesreps,
    settings,
    sync,
)
from . import sync_worker

Base.metadata.create_all(bind=engine)
migrate_db()

from .database import SessionLocal


def _ensure_super_admin():
    from app import models
    from app.security import hash_password

    db = SessionLocal()
    try:
        if db.query(models.User).filter(models.User.username == "superadmin").first():
            return
        db.add(
            models.User(
                username="superadmin",
                password_hash=hash_password("admin1234"),
                name="Super Admin",
                role="platform_admin",
                account_id=None,
                is_active=True,
            )
        )
        db.commit()
    finally:
        db.close()


_ensure_super_admin()


def _seed_demo_if_empty():
    """Load demo accounts on first deploy (empty Postgres)."""
    from app import models

    db = SessionLocal()
    try:
        if db.query(models.Account).count() == 0:
            import seed

            seed.run()
    finally:
        db.close()


_seed_demo_if_empty()


def _ensure_sales_rep_logins():
    """Sync sales-rep app usernames to unique phone; create missing demos if needed."""
    from app import crud, models
    from app.security import hash_password

    db = SessionLocal()
    try:
        reps = db.query(models.SalesRep).all()
        for rep in reps:
            phone = crud.normalize_phone(rep.phone)
            if phone and len(phone) >= 10 and rep.phone != phone:
                if not crud._phone_taken(db, phone, exclude_rep_id=rep.id):
                    rep.phone = phone

            user = (
                db.query(models.User)
                .filter(models.User.sales_rep_id == rep.id)
                .first()
            )
            if user:
                if phone and len(phone) >= 10:
                    clash = (
                        db.query(models.User)
                        .filter(
                            models.User.username == phone,
                            models.User.id != user.id,
                        )
                        .first()
                    )
                    if not clash and user.username != phone:
                        user.username = phone
                continue

            # Missing login: create only when phone is valid and free
            if not phone or len(phone) < 10:
                continue
            if crud._phone_taken(db, phone, exclude_rep_id=rep.id):
                continue
            if db.query(models.User).filter(models.User.username == phone).first():
                continue
            db.add(
                models.User(
                    username=phone,
                    password_hash=hash_password("demo1234"),
                    name=rep.name,
                    role="rep",
                    account_id=rep.owner_account_id,
                    sales_rep_id=rep.id,
                    is_active=True,
                )
            )
        db.commit()
    finally:
        db.close()


_ensure_sales_rep_logins()

app = FastAPI(
    title="GenSoft Ordering Platform API",
    description="Multi-tenant ordering platform connecting distributors, "
    "sub-distributors and retailers.",
    version="3.0.0",
)

_cors = os.getenv("CORS_ORIGINS", "*")
_cors_origins = [o.strip() for o in _cors.split(",") if o.strip()] or ["*"]
# Native Capacitor app (Android/iOS WebView) origins — always allowed
if "*" not in _cors_origins:
    for _native_origin in ("https://localhost", "capacitor://localhost", "http://localhost"):
        if _native_origin not in _cors_origins:
            _cors_origins.append(_native_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(accounts.router)
app.include_router(parties.router)
app.include_router(salesreps.router)
app.include_router(products.router)
app.include_router(batches.router)
app.include_router(connections.router)
app.include_router(marketplace.router)
app.include_router(rep.router)
app.include_router(orders.router)
app.include_router(outstanding.router)
app.include_router(settings.router)
app.include_router(sync.router)

# Background Excel sync — keeps interactive API free while distributors upload
sync_worker.start_sync_worker()


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok"}
