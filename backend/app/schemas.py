from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ---------- Auth ----------
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=4)


class RegisterRequest(BaseModel):
    # account
    account_type: str = "retailer"  # distributor, retailer, sub_distributor
    name: str
    owner_name: str = ""
    address: str = ""
    area: str = ""
    city: str = "Hyderabad"
    mobile: str = ""
    dl_no: str = ""
    gst_no: str = ""
    email: str = ""
    # login
    username: str
    password: str = Field(min_length=4)


# ---------- Account ----------
class AccountBase(BaseModel):
    account_type: str = "retailer"
    name: str
    owner_name: str = ""
    address: str = ""
    area: str = ""
    city: str = "Hyderabad"
    mobile: str = ""
    dl_no: str = ""
    gst_no: str = ""
    email: str = ""


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    owner_name: Optional[str] = None
    address: Optional[str] = None
    area: Optional[str] = None
    city: Optional[str] = None
    mobile: Optional[str] = None
    dl_no: Optional[str] = None
    gst_no: Optional[str] = None
    email: Optional[str] = None


class Account(AccountBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    gensoft_code: str
    is_active: bool
    created_at: datetime


class DirectoryAccount(BaseModel):
    """Public-ish directory view used for linking/connections."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    gensoft_code: str
    account_type: str
    name: str
    area: str
    city: str
    dl_no: str
    gst_no: str
    connection_status: Optional[str] = None  # none, pending, accepted, rejected


# ---------- User ----------
class User(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    name: str
    role: str
    account_id: Optional[int]
    sales_rep_id: Optional[int] = None


class Me(BaseModel):
    user: User
    account: Optional[Account] = None
    sales_rep: Optional["SalesRep"] = None


# ---------- Sales Rep ----------
class SalesRepBase(BaseModel):
    name: str
    phone: str = ""
    email: str = ""


class SalesRepCreate(SalesRepBase):
    username: Optional[str] = None
    password: Optional[str] = None


class SalesRepUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None


class SalesRep(SalesRepBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_account_id: int
    created_at: datetime
    username: Optional[str] = None
    has_login: bool = False


# ---------- Party ----------
class PartyBase(BaseModel):
    code: str = ""
    name: str
    party_type: str = "customer"
    address: str = ""
    area: str = ""
    city: str = "Hyderabad"
    mobile: str = ""
    dl_no: str = ""
    gst_no: str = ""
    sales_rep_id: Optional[int] = None
    min_order_exempt: bool = False
    pricing_model: str = "PTR"
    outstanding_balance: float = 0.0


class PartyCreate(PartyBase):
    pass


class PartyUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    party_type: Optional[str] = None
    address: Optional[str] = None
    area: Optional[str] = None
    city: Optional[str] = None
    mobile: Optional[str] = None
    dl_no: Optional[str] = None
    gst_no: Optional[str] = None
    sales_rep_id: Optional[int] = None
    min_order_exempt: Optional[bool] = None
    pricing_model: Optional[str] = None
    outstanding_balance: Optional[float] = None


class PartyLink(BaseModel):
    linked_account_id: Optional[int] = None


class Party(PartyBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_account_id: int
    linked_account_id: Optional[int]
    created_at: datetime
    linked_account: Optional[DirectoryAccount] = None
    sales_rep: Optional[SalesRep] = None


# ---------- Product ----------
class ProductBase(BaseModel):
    product_code: str = ""
    name: str
    manufacturer: str = ""
    pack_size: str = ""
    hsn_code: str = ""
    category: str = "General"
    schedule: str = ""
    mrp: float = Field(ge=0, default=0.0)
    ptr_rate: float = Field(ge=0, default=0.0)
    pts_rate: float = Field(ge=0, default=0.0)
    special_rate: float = Field(ge=0, default=0.0)
    gst_pct: float = Field(ge=0, default=12.0)
    is_on_hold: bool = False


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    product_code: Optional[str] = None
    name: Optional[str] = None
    manufacturer: Optional[str] = None
    pack_size: Optional[str] = None
    hsn_code: Optional[str] = None
    category: Optional[str] = None
    schedule: Optional[str] = None
    mrp: Optional[float] = Field(default=None, ge=0)
    ptr_rate: Optional[float] = Field(default=None, ge=0)
    pts_rate: Optional[float] = Field(default=None, ge=0)
    special_rate: Optional[float] = Field(default=None, ge=0)
    gst_pct: Optional[float] = Field(default=None, ge=0)
    is_on_hold: Optional[bool] = None


class Product(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_account_id: int
    created_at: datetime
    total_stock: int = 0


# ---------- Stock Batch ----------
class StockBatchBase(BaseModel):
    product_id: int
    batch_no: str = ""
    expiry_date: Optional[date] = None
    available_qty: int = Field(ge=0, default=0)
    scheme: str = ""
    mrp: float = Field(ge=0, default=0.0)
    ptr_rate: float = Field(ge=0, default=0.0)
    pts_rate: float = Field(ge=0, default=0.0)
    show_to_customer: bool = True


class StockBatchCreate(StockBatchBase):
    pass


class StockBatchUpdate(BaseModel):
    batch_no: Optional[str] = None
    expiry_date: Optional[date] = None
    available_qty: Optional[int] = Field(default=None, ge=0)
    scheme: Optional[str] = None
    mrp: Optional[float] = Field(default=None, ge=0)
    ptr_rate: Optional[float] = Field(default=None, ge=0)
    pts_rate: Optional[float] = Field(default=None, ge=0)
    show_to_customer: Optional[bool] = None


class StockBatch(StockBatchBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_account_id: int
    created_at: datetime
    product: Optional[Product] = None


# ---------- Connection ----------
class ConnectionRequest(BaseModel):
    supplier_account_id: int


class Connection(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    requester_account_id: int
    supplier_account_id: int
    status: str
    created_at: datetime
    requester: Optional[DirectoryAccount] = None
    supplier: Optional[DirectoryAccount] = None


# ---------- Order ----------
class OrderItemCreate(BaseModel):
    product_id: int
    batch_id: Optional[int] = None
    qty: int = Field(gt=0)
    free_qty: int = Field(ge=0, default=0)
    rate: Optional[float] = None
    scheme_discount: float = Field(ge=0, default=0.0)


class RepOrderCreate(BaseModel):
    party_id: int
    items: List[OrderItemCreate]
    notes: str = ""


class OrderItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    batch_id: Optional[int]
    qty: int
    free_qty: int
    rate: float
    scheme_discount: float
    gst_pct: float
    gst_amount: float
    line_total: float
    product: Optional[Product] = None
    batch: Optional[StockBatch] = None


class OrderCreate(BaseModel):
    supplier_account_id: int
    sales_rep_id: Optional[int] = None
    source: str = "web"
    notes: str = ""
    items: List[OrderItemCreate]


class OrderStatusUpdate(BaseModel):
    status: str
    remarks: Optional[str] = None


class Order(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_no: str
    buyer_account_id: int
    supplier_account_id: int
    party_id: Optional[int]
    sales_rep_id: Optional[int]
    status: str
    source: str
    total_amount: float
    gst_amount: float
    notes: str
    remarks: str = ""
    created_at: datetime
    item_count: int = 0
    direction: Optional[str] = None  # "received" or "placed" relative to viewer
    buyer: Optional[DirectoryAccount] = None
    supplier: Optional[DirectoryAccount] = None
    party: Optional[Party] = None
    sales_rep: Optional[SalesRep] = None
    items: List[OrderItem] = []


class OrderSummary(BaseModel):
    date_label: str
    order_count: int
    item_count: int
    total_amount: float


# ---------- Dashboard ----------
class DashboardStats(BaseModel):
    account_type: str
    orders_received: int
    orders_placed: int
    revenue: float
    pending_orders: int
    total_products: int
    total_parties: int
    connections: int
    low_stock_products: int
    near_expiry_batches: int


# ---------- Distributor Settings ----------
class DistributorSettings(BaseModel):
    allow_order_no_stock: bool = False
    allow_order_over_stock: bool = False
    display_stock_to_parties: bool = True
    display_stock_to_salesrep: bool = True
    hide_scheme_from_parties: bool = True
    hide_scheme_from_salesrep: bool = True
    hide_hold_products_from_salesrep: bool = False
    minimum_order_value: float = 0.0
    no_order_from: Optional[datetime] = None
    no_order_to: Optional[datetime] = None
    no_order_full_day: bool = False


class DistributorSettingsUpdate(BaseModel):
    allow_order_no_stock: Optional[bool] = None
    allow_order_over_stock: Optional[bool] = None
    display_stock_to_parties: Optional[bool] = None
    display_stock_to_salesrep: Optional[bool] = None
    hide_scheme_from_parties: Optional[bool] = None
    hide_scheme_from_salesrep: Optional[bool] = None
    hide_hold_products_from_salesrep: Optional[bool] = None
    minimum_order_value: Optional[float] = Field(default=None, ge=0)
    no_order_from: Optional[datetime] = None
    no_order_to: Optional[datetime] = None
    no_order_full_day: Optional[bool] = None


# ---------- Super Admin ----------
class AdminAccountRow(BaseModel):
    account: Account
    user_id: int
    username: str
    user_name: str
    user_is_active: bool


class AdminAccountUpdate(BaseModel):
    account_type: Optional[str] = None
    name: Optional[str] = None
    owner_name: Optional[str] = None
    address: Optional[str] = None
    area: Optional[str] = None
    city: Optional[str] = None
    mobile: Optional[str] = None
    dl_no: Optional[str] = None
    gst_no: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None


class AdminUserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = Field(default=None, min_length=4)
    name: Optional[str] = None
    is_active: Optional[bool] = None


class BulkUploadResult(BaseModel):
    created: int
    failed: int
    errors: List[str] = []


# ---------- Product + stock upload ----------
class ProductBatchUploadItem(BaseModel):
    batch_no: str = ""
    expiry_date: Optional[date] = None
    available_qty: int = Field(ge=0, default=0)
    scheme: str = ""
    mrp: Optional[float] = Field(default=None, ge=0)
    ptr_rate: Optional[float] = Field(default=None, ge=0)
    pts_rate: Optional[float] = Field(default=None, ge=0)
    show_to_customer: bool = True


class ProductStockUploadItem(BaseModel):
    product_code: str = ""
    name: str
    manufacturer: str = ""
    pack_size: str = ""
    hsn_code: str = ""
    category: str = "General"
    schedule: str = ""
    mrp: float = Field(ge=0, default=0.0)
    ptr_rate: float = Field(ge=0, default=0.0)
    pts_rate: float = Field(ge=0, default=0.0)
    gst_pct: float = Field(ge=0, default=12.0)
    is_on_hold: bool = False
    batches: List[ProductBatchUploadItem] = []


class ProductStockUpload(BaseModel):
    replace_all: bool = False
    products: List[ProductStockUploadItem]


# ---------- Customer / party upload ----------
class CustomerUploadItem(BaseModel):
    code: str = ""
    name: str
    party_type: str = "customer"
    address: str = ""
    area: str = ""
    city: str = "Hyderabad"
    mobile: str = ""
    dl_no: str = ""
    gst_no: str = ""
    sales_rep_name: str = ""
    pricing_model: str = "PTR"


class CustomerUpload(BaseModel):
    replace_all: bool = False
    customers: List[CustomerUploadItem]


# ---------- Outstanding (invoice ledger from API upload) ----------
class OutstandingBillUploadItem(BaseModel):
    party_id: str = ""
    party_name: str
    invoice_no: str
    invoice_date: Optional[date] = None
    amount: float = Field(ge=0)
    paid: float = Field(ge=0, default=0)
    balance: Optional[float] = Field(default=None, ge=0)
    age: Optional[int] = Field(default=None, ge=0)
    discount: float = Field(ge=0, default=0)


class OutstandingBillUpload(BaseModel):
    replace_all: bool = True
    bills: List[OutstandingBillUploadItem]


class OutstandingBillUploadResult(BaseModel):
    uploaded: int
    failed: int
    errors: List[str] = []


class OutstandingSummary(BaseModel):
    bill_count: int
    total_amount: float
    total_paid: float
    total_balance: float
    total_discount: float


class OutstandingBillRow(BaseModel):
    id: int
    party_id: str
    party_name: str
    invoice_no: str
    invoice_date: Optional[date] = None
    amount: float
    paid: float
    balance: float
    age: int
    discount: float


class OutstandingListResponse(BaseModel):
    summary: OutstandingSummary
    rows: List[OutstandingBillRow]
