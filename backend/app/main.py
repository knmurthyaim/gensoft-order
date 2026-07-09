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
    salesreps,
    settings,
)

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

app = FastAPI(
    title="GenSoft Ordering Platform API",
    description="Multi-tenant ordering platform connecting distributors, "
    "sub-distributors and retailers.",
    version="3.0.0",
)

_cors = os.getenv("CORS_ORIGINS", "*")
_cors_origins = [o.strip() for o in _cors.split(",") if o.strip()] or ["*"]

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
app.include_router(orders.router)
app.include_router(outstanding.router)
app.include_router(settings.router)


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok"}
