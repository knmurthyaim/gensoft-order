import random
import string
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from . import models, schemas
from .security import hash_password, verify_password


class AppError(Exception):
    pass


# ---------- Accounts / Registration ----------
def _gen_code(db: Session) -> str:
    while True:
        code = "GS" + "".join(random.choices(string.digits, k=5))
        if not db.query(models.Account).filter(
            models.Account.gensoft_code == code
        ).first():
            return code


def register_account(db: Session, data: schemas.RegisterRequest):
    account = models.Account(
        gensoft_code=_gen_code(db),
        account_type=data.account_type,
        name=data.name,
        owner_name=data.owner_name,
        address=data.address,
        area=data.area,
        city=data.city,
        mobile=data.mobile,
        dl_no=data.dl_no,
        gst_no=data.gst_no,
        email=data.email,
    )
    db.add(account)
    db.flush()
    user = models.User(
        username=data.username,
        password_hash=hash_password(data.password),
        name=data.owner_name or data.name,
        role="owner",
        account_id=account.id,
    )
    db.add(user)
    db.commit()
    db.refresh(account)
    db.refresh(user)
    return account, user


def update_account(db: Session, account: models.Account, data: schemas.AccountUpdate):
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(account, k, v)
    db.commit()
    db.refresh(account)
    return account


def get_distributor_settings(account: models.Account) -> schemas.DistributorSettings:
    return schemas.DistributorSettings(
        allow_order_no_stock=bool(account.allow_order_no_stock),
        allow_order_over_stock=bool(account.allow_order_over_stock),
        display_stock_to_parties=bool(
            account.display_stock_to_parties
            if account.display_stock_to_parties is not None
            else True
        ),
        display_stock_to_salesrep=bool(
            account.display_stock_to_salesrep
            if account.display_stock_to_salesrep is not None
            else True
        ),
        hide_scheme_from_parties=bool(
            account.hide_scheme_from_parties
            if account.hide_scheme_from_parties is not None
            else True
        ),
        hide_scheme_from_salesrep=bool(
            account.hide_scheme_from_salesrep
            if account.hide_scheme_from_salesrep is not None
            else True
        ),
        hide_hold_products_from_salesrep=bool(
            account.hide_hold_products_from_salesrep
        ),
        track_salesrep_location=bool(
            getattr(account, "track_salesrep_location", False)
        ),
        minimum_order_value=float(account.minimum_order_value or 0),
        no_order_from=account.no_order_from,
        no_order_to=account.no_order_to,
        no_order_full_day=bool(account.no_order_full_day),
    )


def _no_order_notice(supplier: models.Account) -> str | None:
    if not supplier.no_order_from or not supplier.no_order_to:
        return None
    now = datetime.now(timezone.utc)
    start = supplier.no_order_from
    end = supplier.no_order_to
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    if start <= now <= end:
        return (
            f"{supplier.name} has indicated they are not accepting orders "
            "during this period. You may still place your order."
        )
    return None


def update_distributor_settings(
    db: Session, account: models.Account, data: schemas.DistributorSettingsUpdate
):
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(account, k, v)
    db.commit()
    db.refresh(account)
    return get_distributor_settings(account)


# ---------- Directory (central master) ----------
def get_directory(
    db: Session,
    account: models.Account,
    search: Optional[str] = None,
    account_type: Optional[str] = None,
):
    q = db.query(models.Account).filter(models.Account.id != account.id)
    if account_type and account_type != "all":
        q = q.filter(models.Account.account_type == account_type)
    if search:
        term = f"%{search}%"
        q = q.filter(
            or_(
                models.Account.name.ilike(term),
                models.Account.gensoft_code.ilike(term),
                models.Account.area.ilike(term),
                models.Account.city.ilike(term),
            )
        )
    accounts = q.order_by(models.Account.name).all()

    conns = (
        db.query(models.Connection)
        .filter(models.Connection.requester_account_id == account.id)
        .all()
    )
    status_map = {c.supplier_account_id: c.status for c in conns}

    result = []
    for a in accounts:
        d = schemas.DirectoryAccount.model_validate(a)
        d.connection_status = status_map.get(a.id, "none")
        result.append(d)
    return result


# ---------- Sales Reps (scoped) ----------
def get_sales_reps(db: Session, account: models.Account, search: Optional[str] = None):
    q = db.query(models.SalesRep).filter(
        models.SalesRep.owner_account_id == account.id
    )
    if search:
        q = q.filter(models.SalesRep.name.ilike(f"%{search}%"))
    reps = q.order_by(models.SalesRep.name).all()
    return [_enrich_sales_rep(db, r) for r in reps]


def get_sales_rep(db: Session, account: models.Account, rep_id: int):
    obj = (
        db.query(models.SalesRep)
        .filter(
            models.SalesRep.id == rep_id,
            models.SalesRep.owner_account_id == account.id,
        )
        .first()
    )
    return _enrich_sales_rep(db, obj) if obj else None


def _enrich_sales_rep(db: Session, rep: models.SalesRep | None):
    if not rep:
        return None
    user = (
        db.query(models.User)
        .filter(models.User.sales_rep_id == rep.id)
        .first()
    )
    rep.username = user.username if user else None
    rep.has_login = bool(user)
    return rep


def _set_sales_rep_login(
    db: Session,
    account: models.Account,
    rep: models.SalesRep,
    username: Optional[str],
    password: Optional[str],
):
    username = (username or "").strip()
    password = password or ""
    if not username and not password:
        return
    if username and not password:
        # updating username only requires existing user + password for new
        existing = (
            db.query(models.User)
            .filter(models.User.sales_rep_id == rep.id)
            .first()
        )
        if not existing:
            raise AppError("Password is required to create app login")
        clash = (
            db.query(models.User)
            .filter(models.User.username == username, models.User.id != existing.id)
            .first()
        )
        if clash:
            raise AppError(f"Username '{username}' already exists")
        existing.username = username
        return

    if password and not username:
        existing = (
            db.query(models.User)
            .filter(models.User.sales_rep_id == rep.id)
            .first()
        )
        if not existing:
            raise AppError("Username is required to create app login")
        existing.password_hash = hash_password(password)
        return

    # both provided — create or update
    clash = (
        db.query(models.User)
        .filter(models.User.username == username)
        .first()
    )
    existing = (
        db.query(models.User)
        .filter(models.User.sales_rep_id == rep.id)
        .first()
    )
    if clash and (not existing or clash.id != existing.id):
        raise AppError(f"Username '{username}' already exists")
    if existing:
        existing.username = username
        existing.password_hash = hash_password(password)
        existing.name = rep.name
        existing.is_active = True
    else:
        db.add(
            models.User(
                username=username,
                password_hash=hash_password(password),
                name=rep.name,
                role="rep",
                account_id=account.id,
                sales_rep_id=rep.id,
                is_active=True,
            )
        )


def create_sales_rep(db: Session, account: models.Account, data: schemas.SalesRepCreate):
    if account.account_type not in ("distributor", "sub_distributor", "stockist"):
        raise AppError("Only distributors can manage sales reps")
    payload = data.model_dump(exclude={"username", "password"})
    obj = models.SalesRep(owner_account_id=account.id, **payload)
    db.add(obj)
    db.flush()
    try:
        _set_sales_rep_login(db, account, obj, data.username, data.password)
    except AppError:
        db.rollback()
        raise
    db.commit()
    db.refresh(obj)
    return _enrich_sales_rep(db, obj)


def update_sales_rep(db: Session, account, rep_id, data: schemas.SalesRepUpdate):
    obj = (
        db.query(models.SalesRep)
        .filter(
            models.SalesRep.id == rep_id,
            models.SalesRep.owner_account_id == account.id,
        )
        .first()
    )
    if not obj:
        return None
    for k, v in data.model_dump(exclude_unset=True, exclude={"username", "password"}).items():
        setattr(obj, k, v)
    if data.username is not None or data.password is not None:
        _set_sales_rep_login(
            db,
            account,
            obj,
            data.username if data.username is not None else None,
            data.password if data.password is not None else None,
        )
    db.commit()
    db.refresh(obj)
    return _enrich_sales_rep(db, obj)


def delete_sales_rep(db: Session, account, rep_id) -> bool:
    obj = (
        db.query(models.SalesRep)
        .filter(
            models.SalesRep.id == rep_id,
            models.SalesRep.owner_account_id == account.id,
        )
        .first()
    )
    if not obj:
        return False
    db.query(models.User).filter(models.User.sales_rep_id == obj.id).delete(
        synchronize_session=False
    )
    db.query(models.Party).filter(models.Party.sales_rep_id == obj.id).update(
        {models.Party.sales_rep_id: None}, synchronize_session=False
    )
    db.delete(obj)
    db.commit()
    return True


LOCATION_RETENTION_DAYS = 7
LOCATION_INTERVAL_SEC = 60  # check GPS every 1 minute
LOCATION_MIN_MOVE_METERS = 50  # only store if moved ~50m from last point


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    from math import asin, cos, radians, sin, sqrt

    r = 6371000.0
    p1, p2 = radians(lat1), radians(lat2)
    dp = radians(lat2 - lat1)
    dl = radians(lon2 - lon1)
    a = sin(dp / 2) ** 2 + cos(p1) * cos(p2) * sin(dl / 2) ** 2
    return 2 * r * asin(sqrt(a))


def _prune_old_locations(db: Session, owner_account_id: Optional[int] = None):
    cutoff = datetime.now(timezone.utc) - timedelta(days=LOCATION_RETENTION_DAYS)
    q = db.query(models.SalesRepLocation).filter(
        models.SalesRepLocation.recorded_at < cutoff
    )
    if owner_account_id is not None:
        q = q.filter(models.SalesRepLocation.owner_account_id == owner_account_id)
    q.delete(synchronize_session=False)


def get_rep_location_config(db: Session, user: models.User) -> schemas.RepLocationConfig:
    if user.role != "rep" or not user.sales_rep_id or not user.account_id:
        raise AppError("Sales rep login required")
    account = (
        db.query(models.Account).filter(models.Account.id == user.account_id).first()
    )
    enabled = bool(account and getattr(account, "track_salesrep_location", False))
    return schemas.RepLocationConfig(
        enabled=enabled,
        interval_sec=LOCATION_INTERVAL_SEC,
        retention_days=LOCATION_RETENTION_DAYS,
        min_move_meters=LOCATION_MIN_MOVE_METERS,
    )


def record_rep_location(
    db: Session, user: models.User, data: schemas.RepLocationPing
) -> Optional[models.SalesRepLocation]:
    if user.role != "rep" or not user.sales_rep_id or not user.account_id:
        raise AppError("Sales rep login required")
    account = (
        db.query(models.Account).filter(models.Account.id == user.account_id).first()
    )
    if not account or not getattr(account, "track_salesrep_location", False):
        return None  # tracking off — silently ignore

    rep = (
        db.query(models.SalesRep)
        .filter(
            models.SalesRep.id == user.sales_rep_id,
            models.SalesRep.owner_account_id == account.id,
        )
        .first()
    )
    if not rep:
        raise AppError("Sales rep not found")

    _prune_old_locations(db, account.id)

    now = datetime.now(timezone.utc)
    recorded = data.recorded_at or now
    if recorded.tzinfo is None:
        recorded = recorded.replace(tzinfo=timezone.utc)

    lat = float(data.latitude)
    lng = float(data.longitude)

    last = (
        db.query(models.SalesRepLocation)
        .filter(models.SalesRepLocation.sales_rep_id == rep.id)
        .order_by(models.SalesRepLocation.recorded_at.desc())
        .first()
    )
    if last:
        dist = _haversine_m(last.latitude, last.longitude, lat, lng)
        if dist < LOCATION_MIN_MOVE_METERS:
            return last

    ping = models.SalesRepLocation(
        owner_account_id=account.id,
        sales_rep_id=rep.id,
        latitude=lat,
        longitude=lng,
        accuracy_m=float(data.accuracy_m) if data.accuracy_m is not None else None,
        recorded_at=recorded,
    )
    db.add(ping)
    db.commit()
    db.refresh(ping)
    return ping


def record_rep_locations_batch(
    db: Session, user: models.User, data: schemas.RepLocationBatch
) -> schemas.RepLocationBatchResult:
    """Accept offline-queued GPS points; keep only moves of ~50m+."""
    if user.role != "rep" or not user.sales_rep_id or not user.account_id:
        raise AppError("Sales rep login required")
    account = (
        db.query(models.Account).filter(models.Account.id == user.account_id).first()
    )
    if not account or not getattr(account, "track_salesrep_location", False):
        return schemas.RepLocationBatchResult(
            accepted=False, saved=0, skipped=0, reason="tracking_disabled"
        )

    rep = (
        db.query(models.SalesRep)
        .filter(
            models.SalesRep.id == user.sales_rep_id,
            models.SalesRep.owner_account_id == account.id,
        )
        .first()
    )
    if not rep:
        raise AppError("Sales rep not found")

    _prune_old_locations(db, account.id)

    cutoff = datetime.now(timezone.utc) - timedelta(days=LOCATION_RETENTION_DAYS)
    last = (
        db.query(models.SalesRepLocation)
        .filter(models.SalesRepLocation.sales_rep_id == rep.id)
        .order_by(models.SalesRepLocation.recorded_at.desc())
        .first()
    )
    last_lat = last.latitude if last else None
    last_lng = last.longitude if last else None

    saved = 0
    skipped = 0
    now = datetime.now(timezone.utc)
    ordered = sorted(
        data.points or [],
        key=lambda p: p.recorded_at or now,
    )
    for item in ordered:
        recorded = item.recorded_at or now
        if recorded.tzinfo is None:
            recorded = recorded.replace(tzinfo=timezone.utc)
        if recorded < cutoff:
            skipped += 1
            continue
        lat = float(item.latitude)
        lng = float(item.longitude)
        if last_lat is not None and last_lng is not None:
            if _haversine_m(last_lat, last_lng, lat, lng) < LOCATION_MIN_MOVE_METERS:
                skipped += 1
                continue
        ping = models.SalesRepLocation(
            owner_account_id=account.id,
            sales_rep_id=rep.id,
            latitude=lat,
            longitude=lng,
            accuracy_m=float(item.accuracy_m)
            if item.accuracy_m is not None
            else None,
            recorded_at=recorded,
        )
        db.add(ping)
        last_lat, last_lng = lat, lng
        saved += 1

    if saved:
        db.commit()
    return schemas.RepLocationBatchResult(
        accepted=True, saved=saved, skipped=skipped, reason=None
    )


def get_sales_rep_locations_latest(
    db: Session, account: models.Account
) -> List[schemas.SalesRepLocationLatest]:
    if account.account_type not in ("distributor", "sub_distributor", "stockist"):
        raise AppError("Only distributors can view sales rep locations")
    _prune_old_locations(db, account.id)

    reps = (
        db.query(models.SalesRep)
        .filter(models.SalesRep.owner_account_id == account.id)
        .order_by(models.SalesRep.name)
        .all()
    )
    now = datetime.now(timezone.utc)
    rows: List[schemas.SalesRepLocationLatest] = []
    for rep in reps:
        last = (
            db.query(models.SalesRepLocation)
            .filter(models.SalesRepLocation.sales_rep_id == rep.id)
            .order_by(models.SalesRepLocation.recorded_at.desc())
            .first()
        )
        age = None
        if last and last.recorded_at:
            at = last.recorded_at
            if at.tzinfo is None:
                at = at.replace(tzinfo=timezone.utc)
            age = max(int((now - at).total_seconds() // 60), 0)
        rows.append(
            schemas.SalesRepLocationLatest(
                sales_rep_id=rep.id,
                sales_rep_name=rep.name,
                phone=rep.phone or "",
                latitude=last.latitude if last else None,
                longitude=last.longitude if last else None,
                accuracy_m=last.accuracy_m if last else None,
                recorded_at=last.recorded_at if last else None,
                age_minutes=age,
            )
        )
    return rows


def get_sales_rep_location_trail(
    db: Session, account: models.Account, rep_id: int, limit: int = 200
) -> List[schemas.SalesRepLocationPoint]:
    if account.account_type not in ("distributor", "sub_distributor", "stockist"):
        raise AppError("Only distributors can view sales rep locations")
    _prune_old_locations(db, account.id)

    rep = (
        db.query(models.SalesRep)
        .filter(
            models.SalesRep.id == rep_id,
            models.SalesRep.owner_account_id == account.id,
        )
        .first()
    )
    if not rep:
        raise AppError("Sales rep not found")

    limit = max(1, min(int(limit or 200), 500))
    cutoff = datetime.now(timezone.utc) - timedelta(days=LOCATION_RETENTION_DAYS)
    points = (
        db.query(models.SalesRepLocation)
        .filter(
            models.SalesRepLocation.sales_rep_id == rep.id,
            models.SalesRepLocation.recorded_at >= cutoff,
        )
        .order_by(models.SalesRepLocation.recorded_at.desc())
        .limit(limit)
        .all()
    )
    return [
        schemas.SalesRepLocationPoint(
            id=p.id,
            sales_rep_id=p.sales_rep_id,
            latitude=p.latitude,
            longitude=p.longitude,
            accuracy_m=p.accuracy_m,
            recorded_at=p.recorded_at,
        )
        for p in points
    ]


# ---------- Parties (scoped) ----------
def get_parties(
    db: Session,
    account: models.Account,
    search: Optional[str] = None,
    location: Optional[str] = None,
    limit: int = 100,
):
    from sqlalchemy.orm import selectinload

    limit = max(1, min(int(limit or 100), 300))
    q = (
        db.query(models.Party)
        .options(
            selectinload(models.Party.linked_account),
            selectinload(models.Party.sales_rep),
        )
        .filter(models.Party.owner_account_id == account.id)
    )
    term = (search or "").strip()
    if term:
        if len(term) <= 2:
            like = f"{term}%"
        else:
            like = f"%{term}%"
        q = q.filter(
            or_(
                models.Party.name.ilike(like),
                models.Party.code.ilike(like),
                models.Party.mobile.ilike(like),
                models.Party.area.ilike(like),
            )
        )
    if location:
        loc = f"%{location}%"
        q = q.filter(or_(models.Party.area.ilike(loc), models.Party.city.ilike(loc)))
    return q.order_by(models.Party.name).limit(limit).all()


def get_party(db: Session, account: models.Account, party_id: int):
    from sqlalchemy.orm import selectinload

    return (
        db.query(models.Party)
        .options(
            selectinload(models.Party.linked_account),
            selectinload(models.Party.sales_rep),
        )
        .filter(
            models.Party.id == party_id,
            models.Party.owner_account_id == account.id,
        )
        .first()
    )


def create_party(db: Session, account: models.Account, data: schemas.PartyCreate):
    obj = models.Party(owner_account_id=account.id, **data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_party(db: Session, account, party_id, data: schemas.PartyUpdate):
    obj = get_party(db, account, party_id)
    if not obj:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


def link_party(db: Session, account, party_id, linked_account_id: Optional[int]):
    obj = get_party(db, account, party_id)
    if not obj:
        return None
    if linked_account_id:
        target = db.query(models.Account).filter(
            models.Account.id == linked_account_id
        ).first()
        if not target:
            raise AppError("Linked account not found")
    obj.linked_account_id = linked_account_id
    db.commit()
    db.refresh(obj)
    return obj


def delete_party(db: Session, account, party_id) -> bool:
    obj = get_party(db, account, party_id)
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


# ---------- Products (scoped) ----------
def _attach_stock(p: models.Product) -> models.Product:
    p.total_stock = sum(b.available_qty for b in p.stock_batches)
    return p


def get_products(db: Session, account: models.Account, search: Optional[str] = None):
    q = db.query(models.Product).filter(
        models.Product.owner_account_id == account.id
    )
    if search:
        q = q.filter(models.Product.name.ilike(f"%{search}%"))
    return [_attach_stock(p) for p in q.order_by(models.Product.name).all()]


def get_product(db: Session, account: models.Account, product_id: int):
    p = (
        db.query(models.Product)
        .filter(
            models.Product.id == product_id,
            models.Product.owner_account_id == account.id,
        )
        .first()
    )
    return _attach_stock(p) if p else None


def create_product(db: Session, account: models.Account, data: schemas.ProductCreate):
    obj = models.Product(owner_account_id=account.id, **data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _attach_stock(obj)


def update_product(db: Session, account, product_id, data: schemas.ProductUpdate):
    obj = (
        db.query(models.Product)
        .filter(
            models.Product.id == product_id,
            models.Product.owner_account_id == account.id,
        )
        .first()
    )
    if not obj:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return _attach_stock(obj)


def delete_product(db: Session, account, product_id) -> bool:
    obj = (
        db.query(models.Product)
        .filter(
            models.Product.id == product_id,
            models.Product.owner_account_id == account.id,
        )
        .first()
    )
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


# ---------- Batches (scoped) ----------
def get_batches(db: Session, account: models.Account, product_id: Optional[int] = None):
    q = db.query(models.StockBatch).filter(
        models.StockBatch.owner_account_id == account.id
    )
    if product_id:
        q = q.filter(models.StockBatch.product_id == product_id)
    return q.order_by(models.StockBatch.id.desc()).all()


def get_batch(db: Session, account: models.Account, batch_id: int):
    return (
        db.query(models.StockBatch)
        .filter(
            models.StockBatch.id == batch_id,
            models.StockBatch.owner_account_id == account.id,
        )
        .first()
    )


def create_batch(db: Session, account: models.Account, data: schemas.StockBatchCreate):
    product = get_product(db, account, data.product_id)
    if not product:
        raise AppError("Product not found")
    obj = models.StockBatch(owner_account_id=account.id, **data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_batch(db: Session, account, batch_id, data: schemas.StockBatchUpdate):
    obj = get_batch(db, account, batch_id)
    if not obj:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


def delete_batch(db: Session, account, batch_id) -> bool:
    obj = get_batch(db, account, batch_id)
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


# ---------- Connections ----------
def _accepted_supplier_ids(db: Session, account: models.Account) -> List[int]:
    rows = (
        db.query(models.Connection.supplier_account_id)
        .filter(
            models.Connection.requester_account_id == account.id,
            models.Connection.status == "accepted",
        )
        .all()
    )
    return [r[0] for r in rows]


def request_connection(db: Session, account: models.Account, supplier_account_id: int):
    if supplier_account_id == account.id:
        raise AppError("Cannot connect to yourself")
    supplier = db.query(models.Account).filter(
        models.Account.id == supplier_account_id
    ).first()
    if not supplier:
        raise AppError("Supplier account not found")
    existing = (
        db.query(models.Connection)
        .filter(
            models.Connection.requester_account_id == account.id,
            models.Connection.supplier_account_id == supplier_account_id,
        )
        .first()
    )
    if existing:
        if existing.status == "rejected":
            existing.status = "pending"
            db.commit()
            db.refresh(existing)
        return existing
    conn = models.Connection(
        requester_account_id=account.id,
        supplier_account_id=supplier_account_id,
        status="pending",
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return conn


def get_outgoing_connections(db: Session, account: models.Account):
    return (
        db.query(models.Connection)
        .filter(models.Connection.requester_account_id == account.id)
        .order_by(models.Connection.id.desc())
        .all()
    )


def get_incoming_connections(db: Session, account: models.Account):
    return (
        db.query(models.Connection)
        .filter(models.Connection.supplier_account_id == account.id)
        .order_by(models.Connection.id.desc())
        .all()
    )


def respond_connection(db: Session, account: models.Account, conn_id: int, status: str):
    if status not in ("accepted", "rejected"):
        raise AppError("Status must be accepted or rejected")
    conn = (
        db.query(models.Connection)
        .filter(
            models.Connection.id == conn_id,
            models.Connection.supplier_account_id == account.id,
        )
        .first()
    )
    if not conn:
        return None
    conn.status = status
    db.commit()
    db.refresh(conn)
    return conn


# ---------- Marketplace (connected suppliers' visible stock) ----------
def get_supplier_for_catalog(
    db: Session, account: models.Account, supplier_account_id: int
) -> models.Account:
    if supplier_account_id not in _accepted_supplier_ids(db, account):
        raise AppError("Not connected to this supplier")
    supplier = (
        db.query(models.Account)
        .filter(models.Account.id == supplier_account_id)
        .first()
    )
    if not supplier:
        raise AppError("Supplier not found")
    return supplier


def get_supplier_catalog(
    db: Session,
    account: models.Account,
    supplier_account_id: int,
    search: Optional[str] = None,
    limit: int = 40,
    in_stock_only: bool = False,
    first_word_exact: bool = False,
    scheme_only: bool = False,
):
    """Search supplier catalog. Empty search returns []. Never loads full catalog."""
    supplier = get_supplier_for_catalog(db, account, supplier_account_id)

    term = (search or "").strip()
    if not term:
        return []

    allow_no_stock = bool(supplier.allow_order_no_stock)
    # Browse "nil stock" when not filtering to in-stock only (ordering still
    # respects supplier allow_order_no_stock / over-stock rules on submit).
    include_nil = not in_stock_only
    limit = max(1, min(int(limit or 40), 100))

    q = db.query(models.Product).filter(
        models.Product.owner_account_id == supplier_account_id,
        models.Product.is_on_hold.isnot(True),
    )
    if first_word_exact:
        # Match first word of name (word boundary) or exact product code
        first = term.split()[0]
        q = q.filter(
            or_(
                models.Product.name.ilike(f"{first} %"),
                models.Product.name.ilike(first),
                models.Product.product_code.ilike(first),
            )
        )
    else:
        like = f"%{term}%"
        q = q.filter(
            or_(
                models.Product.name.ilike(like),
                models.Product.product_code.ilike(like),
                models.Product.manufacturer.ilike(like),
            )
        )

    products = q.order_by(models.Product.name).limit(limit * 3).all()
    settings = get_distributor_settings(supplier)
    result = []
    for p in products:
        visible = [
            b
            for b in p.stock_batches
            if b.show_to_customer
            and (b.available_qty > 0 or include_nil or allow_no_stock)
            and (not scheme_only or (b.scheme or "").strip())
        ]
        if in_stock_only:
            visible = [b for b in visible if b.available_qty > 0]
        _attach_stock(p)
        if visible:
            result.append({
                "product": p,
                "batches": visible,
                "settings": settings,
            })
        elif include_nil or allow_no_stock:
            # Product exists but no batch rows — still offer for selection
            if not scheme_only:
                result.append({
                    "product": p,
                    "batches": [],
                    "settings": settings,
                })
        if len(result) >= limit:
            break
    return result


def search_products_across_suppliers(
    db: Session,
    account: models.Account,
    search: Optional[str] = None,
    limit: int = 40,
    in_stock_only: bool = False,
    first_word_exact: bool = False,
    scheme_only: bool = False,
):
    """Search a product across all accepted connected suppliers."""
    term = (search or "").strip()
    if not term:
        return []

    supplier_ids = _accepted_supplier_ids(db, account)
    if not supplier_ids:
        return []

    limit = max(1, min(int(limit or 40), 100))
    # Fetch a few matches per supplier so one large supplier can't fill the list alone
    per_supplier = max(3, min(15, limit))

    suppliers = (
        db.query(models.Account)
        .filter(models.Account.id.in_(supplier_ids))
        .all()
    )
    supplier_map = {s.id: s for s in suppliers}

    results = []
    for sid in supplier_ids:
        supplier = supplier_map.get(sid)
        if not supplier:
            continue
        try:
            entries = get_supplier_catalog(
                db,
                account,
                sid,
                search=term,
                limit=per_supplier,
                in_stock_only=in_stock_only,
                first_word_exact=first_word_exact,
                scheme_only=scheme_only,
            )
        except AppError:
            continue
        for entry in entries:
            results.append({
                "product": entry["product"],
                "batches": entry["batches"],
                "settings": entry["settings"],
                "supplier": supplier,
            })
            if len(results) >= limit:
                return results
    # Prefer products whose name starts with the search term
    results.sort(
        key=lambda e: (
            0 if (e["product"].name or "").lower().startswith(term.lower()) else 1,
            (e["product"].name or "").lower(),
            (e["supplier"].name or "").lower(),
        )
    )
    return results[:limit]


def get_rep_customers(
    db: Session,
    user: models.User,
    search: Optional[str] = None,
    limit: int = 100,
):
    """Parties in the distributor party master (paginated / searchable)."""
    if user.role != "rep" or not user.sales_rep_id:
        raise AppError("Sales rep login required")
    from sqlalchemy.orm import noload

    limit = max(1, min(int(limit or 100), 200))
    q = (
        db.query(models.Party)
        .options(
            noload(models.Party.linked_account),
            noload(models.Party.sales_rep),
        )
        .filter(
            models.Party.owner_account_id == user.account_id,
            models.Party.party_type == "customer",
        )
    )
    term = (search or "").strip()
    if term:
        if len(term) <= 2:
            like = f"{term}%"
        else:
            like = f"%{term}%"
        q = q.filter(
            or_(
                models.Party.name.ilike(like),
                models.Party.code.ilike(like),
                models.Party.area.ilike(like),
                models.Party.city.ilike(like),
                models.Party.mobile.ilike(like),
            )
        )
    return q.order_by(models.Party.name).limit(limit).all()


def get_rep_customer(db: Session, user: models.User, party_id: int):
    if user.role != "rep" or not user.sales_rep_id:
        raise AppError("Sales rep login required")
    from sqlalchemy.orm import noload

    return (
        db.query(models.Party)
        .options(
            noload(models.Party.linked_account),
            noload(models.Party.sales_rep),
        )
        .filter(
            models.Party.id == party_id,
            models.Party.owner_account_id == user.account_id,
            models.Party.party_type == "customer",
        )
        .first()
    )


def get_rep_stock(
    db: Session, user: models.User, search: Optional[str] = None, limit: int = 100
):
    """Distributor stock list for sales rep (this distributor only)."""
    if user.role != "rep" or not user.account_id:
        raise AppError("Sales rep login required")
    distributor = (
        db.query(models.Account).filter(models.Account.id == user.account_id).first()
    )
    if not distributor:
        raise AppError("Distributor account not found")

    settings = get_distributor_settings(distributor)
    hide_hold = bool(distributor.hide_hold_products_from_salesrep)
    term = (search or "").strip()
    # Without search, keep the default list small so first open stays fast
    default_cap = 80 if not term else 200
    limit = max(1, min(int(limit or default_cap), default_cap))

    stock_sub = (
        db.query(
            models.StockBatch.product_id.label("product_id"),
            func.coalesce(func.sum(models.StockBatch.available_qty), 0).label("qty"),
            func.count(models.StockBatch.id).label("batch_count"),
            func.max(models.StockBatch.scheme).label("scheme"),
        )
        .filter(
            models.StockBatch.owner_account_id == distributor.id,
            models.StockBatch.show_to_customer.is_(True),
        )
        .group_by(models.StockBatch.product_id)
        .subquery()
    )

    q = (
        db.query(models.Product, stock_sub.c.qty, stock_sub.c.batch_count, stock_sub.c.scheme)
        .outerjoin(stock_sub, stock_sub.c.product_id == models.Product.id)
        .filter(models.Product.owner_account_id == distributor.id)
    )
    if hide_hold:
        q = q.filter(models.Product.is_on_hold.isnot(True))
    if term:
        if len(term) <= 2:
            like = f"{term}%"
        else:
            like = f"%{term}%"
        q = q.filter(
            or_(
                models.Product.name.ilike(like),
                models.Product.product_code.ilike(like),
                models.Product.manufacturer.ilike(like),
            )
        )

    rows_db = q.order_by(models.Product.name).limit(limit).all()
    rows = []
    for p, qty, batch_count, scheme in rows_db:
        total = int(qty or 0)
        p.total_stock = total
        if not settings.display_stock_to_salesrep:
            stock_qty = None
            stock_hidden = True
        else:
            stock_qty = total
            stock_hidden = False
        show_scheme = ""
        if not settings.hide_scheme_from_salesrep and scheme:
            show_scheme = scheme
        rows.append(
            {
                "product": p,
                "available_qty": stock_qty,
                "stock_hidden": stock_hidden,
                "scheme": show_scheme,
                "mrp": p.mrp,
                "ptr_rate": p.ptr_rate,
                "batch_count": int(batch_count or 0),
            }
        )
    return rows, settings


def get_rep_outstanding(
    db: Session, user: models.User, search: Optional[str] = None
):
    """Outstanding bills from distributor party master."""
    if user.role != "rep" or not user.account_id:
        raise AppError("Sales rep login required")
    distributor = (
        db.query(models.Account).filter(models.Account.id == user.account_id).first()
    )
    if not distributor:
        raise AppError("Distributor account not found")
    return get_outstanding(db, distributor, search=search, positive_only=True)


def get_rep_catalog(
    db: Session,
    user: models.User,
    search: Optional[str] = None,
    limit: int = 20,
    in_stock_only: bool = False,
    first_word_exact: bool = False,
    scheme_only: bool = False,
):
    """Fast search of THIS distributor's products only (Vajra stock for a Vajra rep).

    Requires at least 2 characters. Prefix match + SQL stock sum so large catalogs
    stay responsive as product count grows.
    """
    if user.role != "rep" or not user.sales_rep_id or not user.account_id:
        raise AppError("Sales rep login required")
    distributor = (
        db.query(models.Account).filter(models.Account.id == user.account_id).first()
    )
    if not distributor:
        raise AppError("Distributor account not found")

    settings = get_distributor_settings(distributor)
    term = (search or "").strip()
    if len(term) < 2:
        return [], settings

    limit = max(1, min(int(limit or 20), 40))
    hide_hold = bool(distributor.hide_hold_products_from_salesrep)

    stock_sub = (
        db.query(
            models.StockBatch.product_id.label("product_id"),
            func.coalesce(func.sum(models.StockBatch.available_qty), 0).label("qty"),
        )
        .filter(
            models.StockBatch.owner_account_id == distributor.id,
            models.StockBatch.show_to_customer.is_(True),
        )
        .group_by(models.StockBatch.product_id)
        .subquery()
    )

    q = (
        db.query(models.Product, stock_sub.c.qty)
        .outerjoin(stock_sub, stock_sub.c.product_id == models.Product.id)
        .filter(models.Product.owner_account_id == distributor.id)
    )
    if hide_hold:
        q = q.filter(models.Product.is_on_hold.isnot(True))

    if first_word_exact:
        first = term.split()[0]
        q = q.filter(
            or_(
                models.Product.name.ilike(f"{first} %"),
                models.Product.name.ilike(first),
                models.Product.product_code.ilike(first),
            )
        )
    elif len(term) == 2:
        # Prefix-only for short terms (index-friendly vs %xx%)
        pref = f"{term}%"
        q = q.filter(
            or_(
                models.Product.name.ilike(pref),
                models.Product.product_code.ilike(pref),
            )
        )
    else:
        pref = f"{term}%"
        contains = f"%{term}%"
        q = q.filter(
            or_(
                models.Product.name.ilike(pref),
                models.Product.product_code.ilike(pref),
                models.Product.name.ilike(contains),
                models.Product.product_code.ilike(contains),
            )
        )

    if in_stock_only:
        q = q.filter(func.coalesce(stock_sub.c.qty, 0) > 0)

    if scheme_only:
        scheme_exists = (
            db.query(models.StockBatch.id)
            .filter(
                models.StockBatch.product_id == models.Product.id,
                models.StockBatch.owner_account_id == distributor.id,
                models.StockBatch.show_to_customer.is_(True),
                models.StockBatch.scheme.isnot(None),
                models.StockBatch.scheme != "",
            )
            .exists()
        )
        q = q.filter(scheme_exists)

    rows = (
        q.order_by(
            models.Product.name.ilike(f"{term}%").desc(),
            models.Product.name,
        )
        .limit(limit)
        .all()
    )

    result = []
    for p, qty in rows:
        avail = int(qty or 0)
        p.total_stock = avail
        # One summarized batch dict — avoids loading every ERP batch row
        batch = {
            "id": 0,
            "product_id": p.id,
            "owner_account_id": distributor.id,
            "batch_no": "",
            "expiry_date": None,
            "available_qty": avail,
            "scheme": "",
            "mrp": float(p.mrp or 0),
            "ptr_rate": float(p.ptr_rate or 0),
            "pts_rate": float(p.pts_rate or 0),
            "show_to_customer": True,
            "created_at": p.created_at,
            "stock_hidden": False,
            "scheme_hidden": False,
        }
        result.append({"product": p, "batches": [batch], "available_qty": avail})
    return result, settings


def create_rep_order(
    db: Session, user: models.User, data: schemas.RepOrderCreate
):
    if user.role != "rep" or not user.sales_rep_id or not user.account_id:
        raise AppError("Sales rep login required")
    distributor = (
        db.query(models.Account).filter(models.Account.id == user.account_id).first()
    )
    if not distributor:
        raise AppError("Distributor account not found")

    rep = (
        db.query(models.SalesRep)
        .filter(models.SalesRep.id == user.sales_rep_id)
        .first()
    )
    party = (
        db.query(models.Party)
        .filter(
            models.Party.id == data.party_id,
            models.Party.owner_account_id == distributor.id,
            models.Party.party_type == "customer",
        )
        .first()
    )
    if not party:
        raise AppError("Customer not found in your distributor party master")

    # Order is TO the distributor (Vajra), FROM the customer (Sri Dattha),
    # TAKEN BY the sales rep (Naresh). Buyer account = customer's GenSoft
    # login when linked so the retailer also sees it under their orders.
    buyer_id = party.linked_account_id or distributor.id
    rep_name = rep.name if rep else user.name
    note = (data.notes or "").strip()
    auto = (
        f"Customer {party.name} has given this order. "
        f"Taken by sales rep {rep_name}."
    )
    notes = f"{auto} {note}".strip() if note else auto

    order_data = schemas.OrderCreate(
        supplier_account_id=distributor.id,
        sales_rep_id=user.sales_rep_id,
        source="app",
        notes=notes,
        items=data.items,
    )
    return _create_order_as(
        db,
        viewer_account_id=distributor.id,
        buyer_account_id=buyer_id,
        party=party,
        sales_rep_id=user.sales_rep_id,
        data=order_data,
    )


def _create_order_as(
    db: Session,
    viewer_account_id: int,
    buyer_account_id: int,
    party: Optional[models.Party],
    sales_rep_id: Optional[int],
    data: schemas.OrderCreate,
):
    supplier_id = data.supplier_account_id
    supplier = (
        db.query(models.Account).filter(models.Account.id == supplier_id).first()
    )
    if not supplier:
        raise AppError("Supplier not found")
    if not data.items:
        raise AppError("Order must contain at least one item")

    allow_no_stock = bool(supplier.allow_order_no_stock)
    allow_over_stock = bool(supplier.allow_order_over_stock)

    order = models.Order(
        buyer_account_id=buyer_account_id,
        supplier_account_id=supplier_id,
        party_id=party.id if party else None,
        sales_rep_id=sales_rep_id,
        source=data.source,
        notes=data.notes,
        status="received",
    )

    total = 0.0
    gst_total = 0.0
    items = []
    for item in data.items:
        product = (
            db.query(models.Product)
            .filter(
                models.Product.id == item.product_id,
                models.Product.owner_account_id == supplier_id,
            )
            .first()
        )
        if not product:
            raise AppError(f"Product {item.product_id} not available")

        rate = item.rate if item.rate is not None else product.ptr_rate
        gst_pct = product.gst_pct

        if item.batch_id:
            batch = (
                db.query(models.StockBatch)
                .filter(
                    models.StockBatch.id == item.batch_id,
                    models.StockBatch.owner_account_id == supplier_id,
                )
                .first()
            )
            if not batch:
                raise AppError(f"Batch {item.batch_id} not found")
            needed = item.qty + item.free_qty
            if batch.available_qty < needed and not allow_over_stock:
                if batch.available_qty <= 0 and not allow_no_stock:
                    raise AppError(f"No stock for '{product.name}'.")
                raise AppError(
                    f"Insufficient stock for '{product.name}' "
                    f"(available: {batch.available_qty})"
                )
            if batch.available_qty > 0:
                deduct = (
                    min(batch.available_qty, needed) if allow_over_stock else needed
                )
                batch.available_qty -= deduct
            if item.rate is None:
                rate = batch.ptr_rate or product.ptr_rate
        else:
            visible_batches = [
                b
                for b in product.stock_batches
                if b.show_to_customer
            ]
            # Prefer earliest expiry (FEFO), then lower id
            visible_batches.sort(
                key=lambda b: (
                    b.expiry_date is None,
                    b.expiry_date or date.max,
                    b.id or 0,
                )
            )
            total_stock = sum(b.available_qty for b in visible_batches)
            needed = item.qty + item.free_qty
            if total_stock <= 0 and not allow_no_stock:
                raise AppError(f"'{product.name}' is out of stock.")
            if needed > total_stock and total_stock > 0 and not allow_over_stock:
                raise AppError(
                    f"Insufficient stock for '{product.name}' "
                    f"(available: {total_stock})"
                )
            remaining = needed
            allocated_batch_id = None
            for b in visible_batches:
                if remaining <= 0:
                    break
                if b.available_qty <= 0:
                    continue
                take = min(b.available_qty, remaining)
                b.available_qty -= take
                remaining -= take
                if allocated_batch_id is None:
                    allocated_batch_id = b.id
                    if item.rate is None:
                        rate = b.ptr_rate or product.ptr_rate
            # Keep first allocated batch on order line for reference
            if allocated_batch_id is not None and item.batch_id is None:
                item.batch_id = allocated_batch_id

        taxable = max(rate * item.qty - item.scheme_discount, 0.0)
        gst_amount = round(taxable * gst_pct / 100, 2)
        line_total = round(taxable + gst_amount, 2)
        total += line_total
        gst_total += gst_amount
        items.append(
            models.OrderItem(
                product_id=product.id,
                batch_id=item.batch_id,
                qty=item.qty,
                free_qty=item.free_qty,
                rate=rate,
                scheme_discount=item.scheme_discount,
                gst_pct=gst_pct,
                gst_amount=gst_amount,
                line_total=line_total,
            )
        )

    order.items = items
    order.total_amount = round(total, 2)
    order.gst_amount = round(gst_total, 2)

    min_val = float(supplier.minimum_order_value or 0)
    if min_val > 0:
        exempt = party and party.min_order_exempt
        if not exempt and order.total_amount < min_val:
            raise AppError(
                f"Minimum order value is ₹{min_val:.2f}. "
                f"Your order total is ₹{order.total_amount:.2f}."
            )

    if party:
        party.outstanding_balance = round(
            (party.outstanding_balance or 0.0) + order.total_amount, 2
        )
    db.add(order)
    db.flush()
    order.order_no = f"GS{order.id:06d}"
    db.commit()
    db.refresh(order)
    return _enrich_order(order, viewer_account_id)


def get_rep_orders(db: Session, user: models.User):
    if user.role != "rep" or not user.sales_rep_id:
        raise AppError("Sales rep login required")
    orders = (
        db.query(models.Order)
        .filter(models.Order.sales_rep_id == user.sales_rep_id)
        .order_by(models.Order.created_at.desc())
        .all()
    )
    for o in orders:
        _ = o.buyer, o.supplier, o.party, o.sales_rep
    return [_enrich_order(o, user.account_id) for o in orders]


# ---------- Orders ----------
VALID_STATUSES = {
    "received", "viewed", "transferred", "billed",
    "accepted", "completed", "rejected", "cancelled",
}


def _enrich_order(order: models.Order, viewer_account_id: int) -> models.Order:
    order.item_count = len(order.items)
    order.direction = (
        "received" if order.supplier_account_id == viewer_account_id else "placed"
    )
    return order


def get_orders(
    db: Session,
    account: models.Account,
    direction: str = "received",
    statuses: Optional[List[str]] = None,
):
    q = db.query(models.Order)
    if direction == "placed":
        q = q.filter(models.Order.buyer_account_id == account.id)
    elif direction == "all":
        q = q.filter(
            or_(
                models.Order.supplier_account_id == account.id,
                models.Order.buyer_account_id == account.id,
            )
        )
    else:  # received
        q = q.filter(models.Order.supplier_account_id == account.id)
    if statuses:
        q = q.filter(models.Order.status.in_(statuses))
    orders = q.order_by(models.Order.created_at.desc()).all()
    for o in orders:
        _ = o.buyer, o.supplier, o.party, o.sales_rep
    return [_enrich_order(o, account.id) for o in orders]


def get_order(db: Session, account: models.Account, order_id: int):
    order = (
        db.query(models.Order)
        .filter(
            models.Order.id == order_id,
            or_(
                models.Order.supplier_account_id == account.id,
                models.Order.buyer_account_id == account.id,
            ),
        )
        .first()
    )
    if not order:
        return None
    _ = order.buyer, order.supplier, order.party, order.sales_rep, order.items
    for it in order.items:
        _ = it.product
    return _enrich_order(order, account.id)


def get_orders_summary(db: Session, account: models.Account, direction: str = "received"):
    orders = get_orders(db, account, direction)
    return schemas.OrderSummary(
        date_label=date.today().strftime("%d %b %y"),
        order_count=len(orders),
        item_count=sum(len(o.items) for o in orders),
        total_amount=round(
            sum(o.total_amount for o in orders if o.status != "cancelled"), 2
        ),
    )


def create_order(db: Session, account: models.Account, data: schemas.OrderCreate):
    supplier_id = data.supplier_account_id
    if supplier_id == account.id:
        raise AppError("Cannot place an order with yourself")
    if supplier_id not in _accepted_supplier_ids(db, account):
        raise AppError("You are not connected to this supplier")
    if not data.items:
        raise AppError("Order must contain at least one item")

    supplier = (
        db.query(models.Account)
        .filter(models.Account.id == supplier_id)
        .first()
    )
    if not supplier:
        raise AppError("Supplier not found")
    allow_no_stock = bool(supplier.allow_order_no_stock)
    allow_over_stock = bool(supplier.allow_order_over_stock)

    # supplier's party record for this buyer (if linked)
    party = (
        db.query(models.Party)
        .filter(
            models.Party.owner_account_id == supplier_id,
            models.Party.linked_account_id == account.id,
        )
        .first()
    )

    order = models.Order(
        buyer_account_id=account.id,
        supplier_account_id=supplier_id,
        party_id=party.id if party else None,
        sales_rep_id=data.sales_rep_id,
        source=data.source,
        notes=data.notes,
        status="received",
    )

    total = 0.0
    gst_total = 0.0
    items = []
    for item in data.items:
        product = (
            db.query(models.Product)
            .filter(
                models.Product.id == item.product_id,
                models.Product.owner_account_id == supplier_id,
            )
            .first()
        )
        if not product:
            raise AppError(f"Product {item.product_id} not available from supplier")

        rate = item.rate if item.rate is not None else product.ptr_rate
        gst_pct = product.gst_pct
        batch = None

        if item.batch_id:
            batch = (
                db.query(models.StockBatch)
                .filter(
                    models.StockBatch.id == item.batch_id,
                    models.StockBatch.owner_account_id == supplier_id,
                )
                .first()
            )
            if not batch:
                raise AppError(f"Batch {item.batch_id} not found")
            needed = item.qty + item.free_qty
            if batch.available_qty < needed:
                if not allow_over_stock and batch.available_qty <= 0 and not allow_no_stock:
                    raise AppError(
                        f"No stock for '{product.name}'. "
                        "Supplier does not allow orders on out-of-stock items."
                    )
                if not allow_over_stock:
                    raise AppError(
                        f"Insufficient stock for '{product.name}' "
                        f"(available: {batch.available_qty})"
                    )
            if batch.available_qty > 0:
                deduct = min(batch.available_qty, needed) if allow_over_stock else needed
                batch.available_qty -= deduct
            if item.rate is None:
                rate = batch.ptr_rate or product.ptr_rate
        else:
            total_stock = sum(
                b.available_qty
                for b in product.stock_batches
                if b.show_to_customer
            )
            if total_stock <= 0 and not allow_no_stock:
                raise AppError(
                    f"'{product.name}' is out of stock. "
                    "Supplier does not allow orders without stock."
                )
            if item.qty > total_stock and total_stock > 0 and not allow_over_stock:
                raise AppError(
                    f"Insufficient stock for '{product.name}' "
                    f"(available: {total_stock})"
                )

        taxable = max(rate * item.qty - item.scheme_discount, 0.0)
        gst_amount = round(taxable * gst_pct / 100, 2)
        line_total = round(taxable + gst_amount, 2)
        total += line_total
        gst_total += gst_amount
        items.append(
            models.OrderItem(
                product_id=product.id,
                batch_id=item.batch_id,
                qty=item.qty,
                free_qty=item.free_qty,
                rate=rate,
                scheme_discount=item.scheme_discount,
                gst_pct=gst_pct,
                gst_amount=gst_amount,
                line_total=line_total,
            )
        )

    order.items = items
    order.total_amount = round(total, 2)
    order.gst_amount = round(gst_total, 2)

    min_val = float(supplier.minimum_order_value or 0)
    if min_val > 0:
        exempt = party and party.min_order_exempt
        if not exempt and order.total_amount < min_val:
            raise AppError(
                f"Minimum order value is ₹{min_val:.2f}. "
                f"Your order total is ₹{order.total_amount:.2f}."
            )

    if party:
        party.outstanding_balance = round(
            (party.outstanding_balance or 0.0) + order.total_amount, 2
        )
    db.add(order)
    db.flush()
    order.order_no = f"GS{order.id:06d}"
    db.commit()
    db.refresh(order)
    return _enrich_order(order, account.id)


FINAL_STATUSES = {"completed", "rejected", "cancelled"}


def _validate_status_transition(current: str, new: str):
    if current == new:
        return
    if current in FINAL_STATUSES:
        raise AppError(f"Order is '{current}' and cannot be changed.")
    if new == "received" and current != "received":
        raise AppError("Cannot change status back to received once it has been viewed.")


def update_order_status(
    db: Session,
    account: models.Account,
    order_id: int,
    status: str,
    remarks: str | None = None,
):
    if status not in VALID_STATUSES:
        raise AppError(f"Invalid status. Must be one of: {', '.join(sorted(VALID_STATUSES))}")
    order = get_order(db, account, order_id)
    if not order:
        return None
    # Only the supplier can change fulfilment status; buyer can cancel.
    if order.supplier_account_id != account.id and status != "cancelled":
        raise AppError("Only the supplier can update this status")

    _validate_status_transition(order.status, status)

    if status == "rejected":
        text = (remarks or "").strip()
        if not text:
            raise AppError("Remarks are required when rejecting an order.")
        order.remarks = text

    if status == "cancelled" and order.status != "cancelled":
        for item in order.items:
            if item.batch:
                item.batch.available_qty += item.qty + item.free_qty
        if order.party:
            order.party.outstanding_balance = round(
                (order.party.outstanding_balance or 0.0) - order.total_amount, 2
            )

    order.status = status
    db.commit()
    db.refresh(order)
    return _enrich_order(order, account.id)


def delete_order(db: Session, account: models.Account, order_id: int) -> bool:
    order = (
        db.query(models.Order)
        .filter(
            models.Order.id == order_id,
            or_(
                models.Order.supplier_account_id == account.id,
                models.Order.buyer_account_id == account.id,
            ),
        )
        .first()
    )
    if not order:
        return False
    db.delete(order)
    db.commit()
    return True


# ---------- Dashboard ----------
def get_dashboard_stats(db: Session, account: models.Account) -> schemas.DashboardStats:
    received = db.query(models.Order).filter(
        models.Order.supplier_account_id == account.id
    ).all()
    placed = db.query(models.Order).filter(
        models.Order.buyer_account_id == account.id
    ).count()
    revenue = sum(o.total_amount for o in received if o.status != "cancelled")
    pending = sum(1 for o in received if o.status == "received")

    products = db.query(models.Product).filter(
        models.Product.owner_account_id == account.id
    ).all()
    low_stock = sum(
        1 for p in products
        if sum(b.available_qty for b in p.stock_batches) < 10
    )
    soon = date.today() + timedelta(days=90)
    near_expiry = (
        db.query(models.StockBatch)
        .filter(
            models.StockBatch.owner_account_id == account.id,
            models.StockBatch.expiry_date.isnot(None),
            models.StockBatch.expiry_date <= soon,
        )
        .count()
    )
    connections = (
        db.query(models.Connection)
        .filter(
            or_(
                models.Connection.requester_account_id == account.id,
                models.Connection.supplier_account_id == account.id,
            ),
            models.Connection.status == "accepted",
        )
        .count()
    )
    parties = db.query(models.Party).filter(
        models.Party.owner_account_id == account.id
    ).count()

    return schemas.DashboardStats(
        account_type=account.account_type,
        orders_received=len(received),
        orders_placed=placed,
        revenue=round(revenue, 2),
        pending_orders=pending,
        total_products=len(products),
        total_parties=parties,
        connections=connections,
        low_stock_products=low_stock,
        near_expiry_batches=near_expiry,
    )


def get_outstanding(
    db: Session,
    account: models.Account,
    search: Optional[str] = None,
    positive_only: bool = True,
) -> tuple[schemas.OutstandingSummary, List[schemas.OutstandingBillRow]]:
    is_supplier = account.account_type in ("distributor", "sub_distributor")

    if is_supplier:
        q = db.query(models.OutstandingBill).filter(
            models.OutstandingBill.owner_account_id == account.id
        )
    else:
        supplier_ids = _accepted_supplier_ids(db, account)
        if not supplier_ids:
            empty = schemas.OutstandingSummary(
                bill_count=0,
                total_amount=0.0,
                total_paid=0.0,
                total_balance=0.0,
                total_discount=0.0,
            )
            return empty, []
        q = (
            db.query(models.OutstandingBill)
            .join(models.Party, models.OutstandingBill.party_ref_id == models.Party.id)
            .filter(
                models.Party.linked_account_id == account.id,
                models.OutstandingBill.owner_account_id.in_(supplier_ids),
            )
        )

    if positive_only:
        q = q.filter(models.OutstandingBill.balance > 0)

    if search:
        term = f"%{search}%"
        q = q.filter(
            or_(
                models.OutstandingBill.party_name.ilike(term),
                models.OutstandingBill.party_id.ilike(term),
                models.OutstandingBill.invoice_no.ilike(term),
            )
        )

    bills = q.order_by(
        models.OutstandingBill.party_name,
        models.OutstandingBill.invoice_date.desc(),
    ).all()

    rows = [
        schemas.OutstandingBillRow(
            id=b.id,
            party_id=b.party_id or "",
            party_name=b.party_name,
            invoice_no=b.invoice_no,
            invoice_date=b.invoice_date,
            amount=round(b.amount or 0.0, 2),
            paid=round(b.paid or 0.0, 2),
            balance=round(b.balance or 0.0, 2),
            age=_bill_age(b.invoice_date),
            discount=round(b.discount or 0.0, 2),
        )
        for b in bills
    ]

    summary = schemas.OutstandingSummary(
        bill_count=len(rows),
        total_amount=round(sum(r.amount for r in rows), 2),
        total_paid=round(sum(r.paid for r in rows), 2),
        total_balance=round(sum(r.balance for r in rows), 2),
        total_discount=round(sum(r.discount for r in rows), 2),
    )
    return summary, rows


def _resolve_party_ref(
    db: Session, owner_id: int, party_id: str, party_name: str
) -> Optional[int]:
    if party_id:
        by_code = (
            db.query(models.Party)
            .filter(
                models.Party.owner_account_id == owner_id,
                models.Party.code == party_id,
            )
            .first()
        )
        if by_code:
            return by_code.id
        if party_id.isdigit():
            by_id = (
                db.query(models.Party)
                .filter(
                    models.Party.owner_account_id == owner_id,
                    models.Party.id == int(party_id),
                )
                .first()
            )
            if by_id:
                return by_id.id
    by_name = (
        db.query(models.Party)
        .filter(
            models.Party.owner_account_id == owner_id,
            models.Party.name.ilike(party_name.strip()),
        )
        .first()
    )
    return by_name.id if by_name else None


def _bill_age(invoice_date: Optional[date], age: Optional[int] = None) -> int:
    """Days since invoice date (auto). Uploaded age is ignored when date exists."""
    if invoice_date:
        return max((date.today() - invoice_date).days, 0)
    if age is not None:
        return max(int(age), 0)
    return 0


def upload_outstanding_bills(
    db: Session,
    account: models.Account,
    data: schemas.OutstandingBillUpload,
) -> schemas.OutstandingBillUploadResult:
    if account.account_type not in ("distributor", "sub_distributor"):
        raise AppError("Only distributors can upload outstanding bills")

    uploaded = 0
    failed = 0
    errors: List[str] = []

    if data.replace_all:
        db.query(models.OutstandingBill).filter(
            models.OutstandingBill.owner_account_id == account.id
        ).delete(synchronize_session=False)

    for i, item in enumerate(data.bills, start=1):
        try:
            if not item.party_name.strip():
                raise AppError("party_name is required")
            if not item.invoice_no.strip():
                raise AppError("invoice_no is required")

            balance = item.balance
            if balance is None:
                balance = max(
                    item.amount - item.paid - item.discount, 0.0
                )
            age = _bill_age(item.invoice_date, item.age)
            party_ref = _resolve_party_ref(
                db, account.id, item.party_id.strip(), item.party_name
            )

            existing = (
                db.query(models.OutstandingBill)
                .filter(
                    models.OutstandingBill.owner_account_id == account.id,
                    models.OutstandingBill.invoice_no == item.invoice_no.strip(),
                    models.OutstandingBill.party_id == item.party_id.strip(),
                )
                .first()
            )
            payload = dict(
                owner_account_id=account.id,
                party_ref_id=party_ref,
                party_id=item.party_id.strip(),
                party_name=item.party_name.strip(),
                invoice_no=item.invoice_no.strip(),
                invoice_date=item.invoice_date,
                amount=round(item.amount, 2),
                paid=round(item.paid, 2),
                balance=round(balance, 2),
                age=age,
                discount=round(item.discount, 2),
            )
            if existing:
                for k, v in payload.items():
                    if k != "owner_account_id":
                        setattr(existing, k, v)
            else:
                db.add(models.OutstandingBill(**payload))
            uploaded += 1
        except Exception as exc:
            failed += 1
            errors.append(f"Row {i}: {exc}")

    db.commit()
    return schemas.OutstandingBillUploadResult(
        uploaded=uploaded, failed=failed, errors=errors
    )


def _parse_upload_date(val) -> Optional[date]:
    if val is None or val == "":
        return None
    if isinstance(val, date):
        return val
    if isinstance(val, datetime):
        return val.date()
    text = str(val).strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _require_distributor(account: models.Account):
    if account.account_type not in ("distributor", "sub_distributor"):
        raise AppError("Only distributors can upload this data")


def upload_products_with_stock(
    db: Session,
    account: models.Account,
    data: schemas.ProductStockUpload,
) -> schemas.BulkUploadResult:
    _require_distributor(account)
    created = 0
    failed = 0
    errors: List[str] = []

    if data.replace_all:
        product_ids = [
            p.id
            for p in db.query(models.Product)
            .filter(models.Product.owner_account_id == account.id)
            .all()
        ]
        if product_ids:
            db.query(models.StockBatch).filter(
                models.StockBatch.owner_account_id == account.id
            ).delete(synchronize_session=False)
            db.query(models.Product).filter(
                models.Product.owner_account_id == account.id
            ).delete(synchronize_session=False)

    for i, item in enumerate(data.products, start=1):
        try:
            if not item.name.strip():
                raise AppError("name is required")
            code = item.product_code.strip()
            product = None
            if code:
                product = (
                    db.query(models.Product)
                    .filter(
                        models.Product.owner_account_id == account.id,
                        models.Product.product_code == code,
                    )
                    .first()
                )
            if not product:
                product = (
                    db.query(models.Product)
                    .filter(
                        models.Product.owner_account_id == account.id,
                        models.Product.name.ilike(item.name.strip()),
                    )
                    .first()
                )
            payload = item.model_dump(exclude={"batches"})
            if product:
                for k, v in payload.items():
                    setattr(product, k, v)
            else:
                product = models.Product(
                    owner_account_id=account.id, **payload
                )
                db.add(product)
                db.flush()
            if not product.product_code:
                product.product_code = code or f"P{product.id:04d}"

            for batch_item in item.batches:
                batch_no = batch_item.batch_no.strip() or "DEFAULT"
                batch = (
                    db.query(models.StockBatch)
                    .filter(
                        models.StockBatch.owner_account_id == account.id,
                        models.StockBatch.product_id == product.id,
                        models.StockBatch.batch_no == batch_no,
                    )
                    .first()
                )
                bdata = batch_item.model_dump()
                bdata["mrp"] = bdata["mrp"] if bdata["mrp"] is not None else product.mrp
                bdata["ptr_rate"] = (
                    bdata["ptr_rate"] if bdata["ptr_rate"] is not None else product.ptr_rate
                )
                bdata["pts_rate"] = (
                    bdata["pts_rate"] if bdata["pts_rate"] is not None else product.pts_rate
                )
                if batch:
                    for k, v in bdata.items():
                        setattr(batch, k, v)
                else:
                    db.add(
                        models.StockBatch(
                            owner_account_id=account.id,
                            product_id=product.id,
                            **bdata,
                        )
                    )
            created += 1
        except Exception as exc:
            failed += 1
            errors.append(f"Product row {i}: {exc}")

    db.commit()
    return schemas.BulkUploadResult(created=created, failed=failed, errors=errors)


def upload_products_from_excel_rows(
    db: Session, account: models.Account, rows: List[dict]
) -> schemas.BulkUploadResult:
    grouped: dict[str, schemas.ProductStockUploadItem] = {}
    order: List[str] = []
    for row in rows:
        code = str(row.get("product_code", "")).strip()
        name = str(row.get("name", "")).strip()
        key = code or name
        if not key:
            continue
        if key not in grouped:
            grouped[key] = schemas.ProductStockUploadItem(
                product_code=code,
                name=name or key,
                manufacturer=str(row.get("manufacturer", "")).strip(),
                pack_size=str(row.get("pack_size", "")).strip(),
                hsn_code=str(row.get("hsn_code", "")).strip(),
                category=str(row.get("category", "General")).strip() or "General",
                schedule=str(row.get("schedule", "")).strip(),
                mrp=float(row.get("mrp", 0) or 0),
                ptr_rate=float(row.get("ptr_rate", 0) or 0),
                pts_rate=float(row.get("pts_rate", 0) or 0),
                gst_pct=float(row.get("gst_pct", 12) or 12),
                is_on_hold=str(row.get("is_on_hold", "")).lower() in ("1", "true", "yes"),
                batches=[],
            )
            order.append(key)
        qty = row.get("available_qty", 0)
        grouped[key].batches.append(
            schemas.ProductBatchUploadItem(
                batch_no=str(row.get("batch_no", "")).strip(),
                expiry_date=_parse_upload_date(row.get("expiry_date")),
                available_qty=int(float(qty or 0)),
                scheme=str(row.get("scheme", "")).strip(),
                mrp=float(row.get("batch_mrp", row.get("mrp", 0)) or 0) or None,
                ptr_rate=float(row.get("batch_ptr_rate", row.get("ptr_rate", 0)) or 0)
                or None,
                show_to_customer=str(row.get("show_to_customer", "yes")).lower()
                not in ("0", "false", "no"),
            )
        )
    products = [grouped[k] for k in order]
    return upload_products_with_stock(
        db, account, schemas.ProductStockUpload(replace_all=False, products=products)
    )


def upload_customers(
    db: Session,
    account: models.Account,
    data: schemas.CustomerUpload,
) -> schemas.BulkUploadResult:
    _require_distributor(account)
    created = 0
    failed = 0
    errors: List[str] = []

    if data.replace_all:
        db.query(models.Party).filter(
            models.Party.owner_account_id == account.id
        ).delete(synchronize_session=False)

    for i, item in enumerate(data.customers, start=1):
        try:
            if not item.name.strip():
                raise AppError("name is required")
            rep_id = None
            if item.sales_rep_name.strip():
                rep = (
                    db.query(models.SalesRep)
                    .filter(
                        models.SalesRep.owner_account_id == account.id,
                        models.SalesRep.name.ilike(item.sales_rep_name.strip()),
                    )
                    .first()
                )
                rep_id = rep.id if rep else None

            code = item.code.strip()
            party = None
            if code:
                party = (
                    db.query(models.Party)
                    .filter(
                        models.Party.owner_account_id == account.id,
                        models.Party.code == code,
                    )
                    .first()
                )
            if not party:
                party = (
                    db.query(models.Party)
                    .filter(
                        models.Party.owner_account_id == account.id,
                        models.Party.name.ilike(item.name.strip()),
                    )
                    .first()
                )

            payload = item.model_dump(exclude={"sales_rep_name"})
            payload["sales_rep_id"] = rep_id
            if party:
                for k, v in payload.items():
                    setattr(party, k, v)
            else:
                db.add(models.Party(owner_account_id=account.id, **payload))
            created += 1
        except Exception as exc:
            failed += 1
            errors.append(f"Customer row {i}: {exc}")

    db.commit()
    return schemas.BulkUploadResult(created=created, failed=failed, errors=errors)


def upload_customers_from_excel_rows(
    db: Session, account: models.Account, rows: List[dict]
) -> schemas.BulkUploadResult:
    customers = []
    for row in rows:
        name = str(row.get("name", "")).strip()
        if not name:
            continue
        customers.append(
            schemas.CustomerUploadItem(
                code=str(row.get("code", "")).strip(),
                name=name,
                party_type=str(row.get("party_type", "customer")).strip() or "customer",
                address=str(row.get("address", "")).strip(),
                area=str(row.get("area", "")).strip(),
                city=str(row.get("city", "Hyderabad")).strip() or "Hyderabad",
                mobile=str(row.get("mobile", "")).strip(),
                dl_no=str(row.get("dl_no", "")).strip(),
                gst_no=str(row.get("gst_no", "")).strip(),
                sales_rep_name=str(row.get("sales_rep_name", "")).strip(),
                pricing_model=str(row.get("pricing_model", "PTR")).strip() or "PTR",
            )
        )
    return upload_customers(
        db, account, schemas.CustomerUpload(replace_all=False, customers=customers)
    )


def upload_outstanding_from_excel_rows(
    db: Session, account: models.Account, rows: List[dict]
) -> schemas.OutstandingBillUploadResult:
    bills = []
    for row in rows:
        party_name = str(row.get("party_name", "")).strip()
        invoice_no = str(row.get("invoice_no", "")).strip()
        if not party_name or not invoice_no:
            continue
        inv_date = _parse_upload_date(row.get("invoice_date"))
        amount = float(row.get("amount", 0) or 0)
        paid = float(row.get("paid", 0) or 0)
        discount = float(row.get("discount", 0) or 0)
        balance_raw = row.get("balance")
        balance = (
            float(balance_raw)
            if balance_raw not in (None, "")
            else None
        )
        age_raw = row.get("age")
        age = int(age_raw) if age_raw not in (None, "") else None
        bills.append(
            schemas.OutstandingBillUploadItem(
                party_id=str(row.get("party_id", "")).strip(),
                party_name=party_name,
                invoice_no=invoice_no,
                invoice_date=inv_date,
                amount=amount,
                paid=paid,
                balance=balance,
                age=age,
                discount=discount,
            )
        )
    return upload_outstanding_bills(
        db,
        account,
        schemas.OutstandingBillUpload(replace_all=False, bills=bills),
    )


# ---------- Super Admin ----------
def list_admin_accounts(db: Session) -> List[schemas.AdminAccountRow]:
    accounts = db.query(models.Account).order_by(models.Account.name).all()
    rows = []
    for acc in accounts:
        owner = (
            db.query(models.User)
            .filter(models.User.account_id == acc.id, models.User.role == "owner")
            .first()
        )
        if not owner:
            continue
        rows.append(
            schemas.AdminAccountRow(
                account=acc,
                user_id=owner.id,
                username=owner.username,
                user_name=owner.name,
                user_is_active=owner.is_active,
            )
        )
    return rows


def admin_get_account(db: Session, account_id: int):
    acc = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not acc:
        return None
    owner = (
        db.query(models.User)
        .filter(models.User.account_id == acc.id, models.User.role == "owner")
        .first()
    )
    if not owner:
        return None
    return schemas.AdminAccountRow(
        account=acc,
        user_id=owner.id,
        username=owner.username,
        user_name=owner.name,
        user_is_active=owner.is_active,
    )


def admin_update_account(db: Session, account_id: int, data: schemas.AdminAccountUpdate):
    acc = db.query(models.Account).filter(models.Account.id == account_id).first()
    if not acc:
        return None
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(acc, k, v)
    db.commit()
    db.refresh(acc)
    return admin_get_account(db, account_id)


def admin_update_user(db: Session, user_id: int, data: schemas.AdminUserUpdate):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user or user.role == "platform_admin":
        return None
    if data.username and data.username != user.username:
        exists = (
            db.query(models.User)
            .filter(models.User.username == data.username, models.User.id != user_id)
            .first()
        )
        if exists:
            raise AppError("Username already taken")
        user.username = data.username
    if data.password:
        user.password_hash = hash_password(data.password)
    if data.name is not None:
        user.name = data.name
    if data.is_active is not None:
        user.is_active = data.is_active
    db.commit()
    db.refresh(user)
    if user.account_id:
        return admin_get_account(db, user.account_id)
    return None


def change_password(
    db: Session, user: models.User, current_password: str, new_password: str
):
    if not verify_password(current_password, user.password_hash):
        raise AppError("Current password is incorrect")
    user.password_hash = hash_password(new_password)
    db.commit()
    return True


def _normalize_header(h: str) -> str:
    key = (h or "").strip().lower().replace(" ", "_")
    aliases = {
        "accounttype": "account_type",
        "business_name": "name",
        "businessname": "name",
        "owner": "owner_name",
        "ownername": "owner_name",
        "dlno": "dl_no",
        "dl_no.": "dl_no",
        "gstno": "gst_no",
        "gst_no.": "gst_no",
        "user_name": "username",
        "login": "username",
        "login_id": "username",
    }
    return aliases.get(key, key)


def bulk_upload_accounts(db: Session, rows: List[dict]) -> schemas.BulkUploadResult:
    created = 0
    failed = 0
    errors: List[str] = []
    for i, row in enumerate(rows, start=2):
        try:
            username = str(row.get("username", "")).strip()
            password = str(row.get("password", "")).strip()
            name = str(row.get("name", "")).strip()
            if not username or not password or not name:
                raise AppError("name, username and password are required")
            if (
                db.query(models.User)
                .filter(models.User.username == username)
                .first()
            ):
                raise AppError(f"Username '{username}' already exists")
            data = schemas.RegisterRequest(
                account_type=str(row.get("account_type", "retailer")).strip()
                or "retailer",
                name=name,
                owner_name=str(row.get("owner_name", "")).strip(),
                address=str(row.get("address", "")).strip(),
                area=str(row.get("area", "")).strip(),
                city=str(row.get("city", "Hyderabad")).strip() or "Hyderabad",
                mobile=str(row.get("mobile", "")).strip(),
                dl_no=str(row.get("dl_no", "")).strip(),
                gst_no=str(row.get("gst_no", "")).strip(),
                email=str(row.get("email", "")).strip(),
                username=username,
                password=password,
            )
            register_account(db, data)
            created += 1
        except Exception as exc:
            failed += 1
            errors.append(f"Row {i}: {exc}")
    return schemas.BulkUploadResult(created=created, failed=failed, errors=errors)
