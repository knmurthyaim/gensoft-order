from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from .database import Base


def utcnow():
    return datetime.now(timezone.utc)


class Account(Base):
    """A business on the GenSoft platform. Doubles as the central directory
    entry AND the data-isolation tenant (distributor / retailer / sub-distributor)."""

    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    gensoft_code = Column(String, unique=True, index=True, nullable=False)
    account_type = Column(String, default="retailer")  # distributor, retailer, sub_distributor, stockist
    name = Column(String, nullable=False, index=True)
    owner_name = Column(String, default="")
    address = Column(String, default="")
    area = Column(String, default="")
    city = Column(String, default="Hyderabad")
    mobile = Column(String, default="")
    dl_no = Column(String, default="")
    gst_no = Column(String, default="")
    email = Column(String, default="")
    is_active = Column(Boolean, default=True)
    # Distributor order settings (used when account is supplier)
    allow_order_no_stock = Column(Boolean, default=False)
    allow_order_over_stock = Column(Boolean, default=False)
    display_stock_to_parties = Column(Boolean, default=True)
    display_stock_to_salesrep = Column(Boolean, default=True)
    hide_scheme_from_parties = Column(Boolean, default=True)
    hide_scheme_from_salesrep = Column(Boolean, default=True)
    hide_hold_products_from_salesrep = Column(Boolean, default=False)
    track_salesrep_location = Column(Boolean, default=False)
    minimum_order_value = Column(Float, default=0.0)
    no_order_from = Column(DateTime, nullable=True)
    no_order_to = Column(DateTime, nullable=True)
    no_order_full_day = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)

    users = relationship("User", back_populates="account", cascade="all, delete-orphan")
    parties = relationship("Party", back_populates="owner", cascade="all, delete-orphan",
                           foreign_keys="Party.owner_account_id")
    sales_reps = relationship("SalesRep", back_populates="owner", cascade="all, delete-orphan")
    products = relationship("Product", back_populates="owner", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    name = Column(String, default="")
    role = Column(String, default="owner")  # platform_admin, owner, rep
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    sales_rep_id = Column(Integer, ForeignKey("sales_reps.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)

    account = relationship("Account", back_populates="users")
    sales_rep = relationship("SalesRep", foreign_keys=[sales_rep_id])


class Party(Base):
    """A tenant's own party master (their customers / suppliers).
    Can be linked to a GenSoft Account for connected ordering."""

    __tablename__ = "parties"

    id = Column(Integer, primary_key=True, index=True)
    owner_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    code = Column(String, default="", index=True)
    name = Column(String, nullable=False, index=True)
    party_type = Column(String, default="customer", index=True)  # customer, supplier
    address = Column(String, default="")
    area = Column(String, default="")
    city = Column(String, default="Hyderabad")
    mobile = Column(String, default="")
    dl_no = Column(String, default="")
    gst_no = Column(String, default="")
    linked_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True)
    sales_rep_id = Column(Integer, ForeignKey("sales_reps.id"), nullable=True)
    min_order_exempt = Column(Boolean, default=False)
    pricing_model = Column(String, default="PTR")  # PTR or PTS
    outstanding_balance = Column(Float, default=0.0)
    created_at = Column(DateTime, default=utcnow)
    # Customer shop GPS tagged by sales reps (shared for all reps of this distributor)
    location_lat = Column(Float, nullable=True)
    location_lng = Column(Float, nullable=True)
    location_tagged_at = Column(DateTime, nullable=True)
    location_tagged_by_rep_id = Column(
        Integer, ForeignKey("sales_reps.id"), nullable=True
    )

    owner = relationship("Account", back_populates="parties",
                         foreign_keys=[owner_account_id])
    linked_account = relationship("Account", foreign_keys=[linked_account_id])
    sales_rep = relationship("SalesRep", foreign_keys=[sales_rep_id])
    location_tagged_by = relationship(
        "SalesRep", foreign_keys=[location_tagged_by_rep_id]
    )


class SalesRep(Base):
    __tablename__ = "sales_reps"

    id = Column(Integer, primary_key=True, index=True)
    owner_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    name = Column(String, nullable=False, index=True)
    phone = Column(String, default="")
    email = Column(String, default="")
    created_at = Column(DateTime, default=utcnow)

    owner = relationship("Account", back_populates="sales_reps")
    locations = relationship(
        "SalesRepLocation",
        back_populates="sales_rep",
        cascade="all, delete-orphan",
    )


class SalesRepLocation(Base):
    """GPS pings from sales rep app. Kept for 7 days; distributor-only reads."""

    __tablename__ = "sales_rep_locations"

    id = Column(Integer, primary_key=True, index=True)
    owner_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    sales_rep_id = Column(Integer, ForeignKey("sales_reps.id"), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    accuracy_m = Column(Float, nullable=True)
    recorded_at = Column(DateTime, default=utcnow, index=True)

    sales_rep = relationship("SalesRep", back_populates="locations")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    owner_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    product_code = Column(String, default="", index=True)
    name = Column(String, nullable=False, index=True)
    manufacturer = Column(String, default="")
    pack_size = Column(String, default="")
    hsn_code = Column(String, default="")
    category = Column(String, default="General")
    schedule = Column(String, default="")
    mrp = Column(Float, nullable=False, default=0.0)
    ptr_rate = Column(Float, nullable=False, default=0.0)
    pts_rate = Column(Float, nullable=False, default=0.0)
    special_rate = Column(Float, nullable=False, default=0.0)
    gst_pct = Column(Float, nullable=False, default=12.0)
    is_on_hold = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)

    owner = relationship("Account", back_populates="products")
    stock_batches = relationship(
        "StockBatch", back_populates="product", cascade="all, delete-orphan"
    )


class StockBatch(Base):
    __tablename__ = "stock_batches"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    owner_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    batch_no = Column(String, default="")
    expiry_date = Column(Date, nullable=True)
    available_qty = Column(Integer, nullable=False, default=0)
    scheme = Column(String, default="")
    mrp = Column(Float, nullable=False, default=0.0)
    ptr_rate = Column(Float, nullable=False, default=0.0)
    pts_rate = Column(Float, nullable=False, default=0.0)
    show_to_customer = Column(Boolean, default=True)  # batch visibility toggle
    created_at = Column(DateTime, default=utcnow)

    product = relationship("Product", back_populates="stock_batches")


class Connection(Base):
    """Opt-in link between a buyer account (retailer/sub-distributor) and a
    supplier account (distributor). Stock is shared only after acceptance."""

    __tablename__ = "connections"

    id = Column(Integer, primary_key=True, index=True)
    requester_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    supplier_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    status = Column(String, default="pending")  # pending, accepted, rejected
    created_at = Column(DateTime, default=utcnow)

    requester = relationship("Account", foreign_keys=[requester_account_id])
    supplier = relationship("Account", foreign_keys=[supplier_account_id])


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_no = Column(String, unique=True, index=True, default="")
    buyer_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    supplier_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    party_id = Column(Integer, ForeignKey("parties.id"), nullable=True)
    sales_rep_id = Column(Integer, ForeignKey("sales_reps.id"), nullable=True)
    status = Column(String, default="received")
    # received, viewed, transferred, billed, accepted, completed, rejected, cancelled
    source = Column(String, default="web")
    total_amount = Column(Float, default=0.0)
    gst_amount = Column(Float, default=0.0)
    notes = Column(String, default="")
    remarks = Column(String, default="")  # rejection / status remarks
    created_at = Column(DateTime, default=utcnow)

    buyer = relationship("Account", foreign_keys=[buyer_account_id])
    supplier = relationship("Account", foreign_keys=[supplier_account_id])
    party = relationship("Party", foreign_keys=[party_id])
    sales_rep = relationship("SalesRep", foreign_keys=[sales_rep_id])
    items = relationship(
        "OrderItem", back_populates="order", cascade="all, delete-orphan"
    )


class OutstandingBill(Base):
    """Invoice-wise outstanding uploaded from external billing / ERP API."""

    __tablename__ = "outstanding_bills"

    id = Column(Integer, primary_key=True, index=True)
    owner_account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    party_ref_id = Column(Integer, ForeignKey("parties.id"), nullable=True)
    party_id = Column(String, default="", index=True)  # external / ERP party id
    party_name = Column(String, nullable=False, index=True)
    invoice_no = Column(String, nullable=False, index=True)
    invoice_date = Column(Date, nullable=True)
    amount = Column(Float, nullable=False, default=0.0)
    paid = Column(Float, nullable=False, default=0.0)
    balance = Column(Float, nullable=False, default=0.0)
    age = Column(Integer, nullable=False, default=0)
    discount = Column(Float, nullable=False, default=0.0)
    uploaded_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    owner = relationship("Account", foreign_keys=[owner_account_id])
    party = relationship("Party", foreign_keys=[party_ref_id])


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    batch_id = Column(Integer, ForeignKey("stock_batches.id"), nullable=True)
    qty = Column(Integer, nullable=False, default=1)
    free_qty = Column(Integer, nullable=False, default=0)
    rate = Column(Float, nullable=False, default=0.0)
    scheme_discount = Column(Float, nullable=False, default=0.0)
    gst_pct = Column(Float, nullable=False, default=0.0)
    gst_amount = Column(Float, nullable=False, default=0.0)
    line_total = Column(Float, nullable=False, default=0.0)

    order = relationship("Order", back_populates="items")
    product = relationship("Product", foreign_keys=[product_id])
    batch = relationship("StockBatch", foreign_keys=[batch_id])


class SyncJob(Base):
    """Background Excel sync job — keeps the interactive API free while uploading."""

    __tablename__ = "sync_jobs"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False, index=True)
    upload_type = Column(String, nullable=False)  # customers | products | outstanding
    status = Column(String, default="pending", index=True)
    # pending | processing | completed | failed
    replace_all = Column(Boolean, default=True)
    original_filename = Column(String, default="")
    file_path = Column(String, default="")
    result_json = Column(Text, default="")
    error = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)

    owner = relationship("Account", foreign_keys=[account_id])
