"""Seed GenSoft with sample accounts, users, products, connections and orders.

Demo logins (all passwords: demo1234):
  - vajra      -> Vajra Pharma Distributors (distributor)
  - balaji     -> Balaji Medical Agencies (distributor)
  - dattha     -> Sri Dattha Central Pharmacy (retailer)
  - vasavi     -> Vasavi Medical Stores (retailer)

Super Admin:
  - superadmin / admin1234
"""
from datetime import date, timedelta

from app import models
from app.database import Base, SessionLocal, engine
from app.security import hash_password

Base.metadata.create_all(bind=engine)

PASSWORD = "demo1234"
ADMIN_USER = "superadmin"
ADMIN_PASS = "admin1234"


def ensure_super_admin(db):
    if db.query(models.User).filter(models.User.username == ADMIN_USER).first():
        return
    db.add(
        models.User(
            username=ADMIN_USER,
            password_hash=hash_password(ADMIN_PASS),
            name="Super Admin",
            role="platform_admin",
            account_id=None,
            is_active=True,
        )
    )
    db.commit()
    print(f"Super admin created: {ADMIN_USER} / {ADMIN_PASS}")


def run():
    db = SessionLocal()
    try:
        ensure_super_admin(db)
        if db.query(models.Account).count() > 0:
            print("Data already present; skipping seed.")
            return

        # ---- Accounts ----
        vajra = models.Account(
            gensoft_code="GS10001", account_type="distributor",
            name="Vajra Pharma Distributors", owner_name="Ramesh",
            address="Vidyanagar", area="New Nallakunta", city="Hyderabad",
            mobile="9848496131", dl_no="TS/HYD/20B-12345", gst_no="36ABCDE1234F1Z5",
            email="vajra@example.com",
        )
        balaji = models.Account(
            gensoft_code="GS10002", account_type="distributor",
            name="Balaji Medical Agencies", owner_name="Krishna",
            address="Somajiguda", area="Somajiguda", city="Hyderabad",
            mobile="9052102344", dl_no="TS/HYD/21B-67890", gst_no="36PQRSX6789K1Z2",
            email="balaji@example.com",
        )
        dattha = models.Account(
            gensoft_code="GS20001", account_type="retailer",
            name="Sri Dattha Central Pharmacy", owner_name="Ravi B",
            address="Kukatpally", area="Kukatpally", city="Hyderabad",
            mobile="9848496131", dl_no="TS/HYD/20R-1001", gst_no="36RETAIL001Z1Z9",
            email="ravi@example.com",
        )
        vasavi = models.Account(
            gensoft_code="GS20002", account_type="retailer",
            name="Vasavi Medical Stores", owner_name="Kishan",
            address="Gandhi Nagar", area="Gandhi Nagar", city="Hyderabad",
            mobile="9666009999", dl_no="TS/HYD/20R-1002", gst_no="36RETAIL002Z1Z8",
            email="kishan@example.com",
        )
        db.add_all([vajra, balaji, dattha, vasavi])
        db.flush()

        # ---- Users ----
        for acc, uname in [
            (vajra, "vajra"), (balaji, "balaji"),
            (dattha, "dattha"), (vasavi, "vasavi"),
        ]:
            db.add(models.User(
                username=uname, password_hash=hash_password(PASSWORD),
                name=acc.owner_name, role="owner", account_id=acc.id,
            ))

        # ---- Sales reps (per distributor) ----
        naresh = models.SalesRep(owner_account_id=vajra.id, name="M Naresh",
                                 phone="9000011111", email="naresh@example.com")
        suresh = models.SalesRep(owner_account_id=vajra.id, name="Suresh Kumar",
                                 phone="9000022222", email="suresh@example.com")
        anil = models.SalesRep(owner_account_id=balaji.id, name="Anil Reddy",
                               phone="9000033333", email="anil@example.com")
        db.add_all([naresh, suresh, anil])
        db.flush()
        # App logins for sales reps (scoped to assigned customers + own stock)
        db.add(
            models.User(
                username="naresh",
                password_hash=hash_password(PASSWORD),
                name=naresh.name,
                role="rep",
                account_id=vajra.id,
                sales_rep_id=naresh.id,
            )
        )
        db.add(
            models.User(
                username="suresh",
                password_hash=hash_password(PASSWORD),
                name=suresh.name,
                role="rep",
                account_id=vajra.id,
                sales_rep_id=suresh.id,
            )
        )

        # ---- Products for Vajra ----
        vajra_products = [
            dict(product_code="PAR650", name="Paracetamol 650mg", manufacturer="Cipla", pack_size="10x10",
                 hsn_code="30049099", category="Analgesic", schedule="OTC",
                 mrp=30.0, ptr_rate=24.0, pts_rate=22.0, special_rate=21.0, gst_pct=12.0),
            dict(product_code="AMX500", name="Amoxicillin 500mg", manufacturer="Sun Pharma", pack_size="10x10",
                 hsn_code="30041020", category="Antibiotic", schedule="H",
                 mrp=85.0, ptr_rate=68.0, pts_rate=64.0, special_rate=62.0, gst_pct=12.0),
            dict(product_code="PAN40", name="Pantoprazole 40mg", manufacturer="Dr Reddy's", pack_size="10x10",
                 hsn_code="30049099", category="Antacid", schedule="H",
                 mrp=110.0, ptr_rate=88.0, pts_rate=84.0, special_rate=80.0, gst_pct=12.0),
            dict(product_code="CET10", name="Cetirizine 10mg", manufacturer="Mankind", pack_size="10x10",
                 hsn_code="30049099", category="Antihistamine", schedule="OTC",
                 mrp=22.0, ptr_rate=17.0, pts_rate=16.0, special_rate=15.0, gst_pct=12.0),
        ]
        # ---- Products for Balaji ----
        balaji_products = [
            dict(product_code="AZI500", name="Azithromycin 500mg", manufacturer="Alkem", pack_size="1x3",
                 hsn_code="30042090", category="Antibiotic", schedule="H",
                 mrp=75.0, ptr_rate=60.0, pts_rate=57.0, special_rate=55.0, gst_pct=12.0),
            dict(product_code="VITD60", name="Vitamin D3 60K", manufacturer="Abbott", pack_size="1x4",
                 hsn_code="30045010", category="Supplement", schedule="OTC",
                 mrp=145.0, ptr_rate=116.0, pts_rate=110.0, special_rate=108.0, gst_pct=18.0),
        ]

        today = date.today()

        def add_products(account, defs, schemes):
            objs = []
            for i, d in enumerate(defs):
                p = models.Product(owner_account_id=account.id, **d)
                db.add(p)
                db.flush()
                db.add(models.StockBatch(
                    product_id=p.id, owner_account_id=account.id,
                    batch_no=f"B{1000 + p.id}",
                    expiry_date=today + timedelta(days=300 + i * 40),
                    available_qty=[200, 150, 80, 300][i % 4],
                    scheme=schemes[i % len(schemes)],
                    mrp=p.mrp, ptr_rate=p.ptr_rate, pts_rate=p.pts_rate,
                    show_to_customer=True,
                ))
                objs.append(p)
            return objs

        vp = add_products(vajra, vajra_products, ["10+1", "", "5+1", ""])
        add_products(balaji, balaji_products, ["", "10+2"])

        # ---- Vajra's own party master (its retailers), linked to GenSoft accounts ----
        db.add(models.Party(
            owner_account_id=vajra.id, code="R001", name="Sri Dattha Central Pharmacy",
            party_type="customer", area="Kukatpally", city="Hyderabad",
            mobile="9848496131", dl_no="TS/HYD/20R-1001",
            linked_account_id=dattha.id, sales_rep_id=naresh.id, pricing_model="PTR",
        ))
        db.add(models.Party(
            owner_account_id=vajra.id, code="R002", name="Vasavi Medical Stores",
            party_type="customer", area="Gandhi Nagar", city="Hyderabad",
            mobile="9666009999", dl_no="TS/HYD/20R-1002",
            linked_account_id=vasavi.id, sales_rep_id=suresh.id, pricing_model="PTR",
        ))
        # A retailer's own supplier master
        db.add(models.Party(
            owner_account_id=dattha.id, code="D001", name="Vajra Pharma Distributors",
            party_type="supplier", area="New Nallakunta", city="Hyderabad",
            mobile="9848496131", linked_account_id=vajra.id,
        ))

        # ---- Connections (retailers connected to Vajra) ----
        db.add(models.Connection(requester_account_id=dattha.id,
                                 supplier_account_id=vajra.id, status="accepted"))
        db.add(models.Connection(requester_account_id=vasavi.id,
                                 supplier_account_id=vajra.id, status="accepted"))
        db.add(models.Connection(requester_account_id=dattha.id,
                                 supplier_account_id=balaji.id, status="pending"))
        db.flush()

        # ---- A sample order from Dattha -> Vajra ----
        dattha_party = db.query(models.Party).filter(
            models.Party.owner_account_id == vajra.id,
            models.Party.linked_account_id == dattha.id,
        ).first()
        vasavi_party = db.query(models.Party).filter(
            models.Party.owner_account_id == vajra.id,
            models.Party.code == "R002",
        ).first()

        # ---- Sample outstanding bills (ERP upload) ----
        today = date.today()
        db.add_all([
            models.OutstandingBill(
                owner_account_id=vajra.id,
                party_ref_id=dattha_party.id if dattha_party else None,
                party_id="R001",
                party_name="Sri Dattha Central Pharmacy",
                invoice_no="INV-24001",
                invoice_date=today - timedelta(days=45),
                amount=25000.0,
                paid=8000.0,
                balance=17000.0,
                age=45,
                discount=0.0,
            ),
            models.OutstandingBill(
                owner_account_id=vajra.id,
                party_ref_id=dattha_party.id if dattha_party else None,
                party_id="R001",
                party_name="Sri Dattha Central Pharmacy",
                invoice_no="INV-24015",
                invoice_date=today - timedelta(days=12),
                amount=8500.0,
                paid=1500.0,
                balance=6850.0,
                age=12,
                discount=150.0,
            ),
            models.OutstandingBill(
                owner_account_id=vajra.id,
                party_ref_id=dattha_party.id if dattha_party else None,
                party_id="R001",
                party_name="Sri Dattha Central Pharmacy",
                invoice_no="INV-24028",
                invoice_date=today - timedelta(days=5),
                amount=4200.0,
                paid=0.0,
                balance=4200.0,
                age=5,
                discount=0.0,
            ),
            models.OutstandingBill(
                owner_account_id=vajra.id,
                party_ref_id=vasavi_party.id if vasavi_party else None,
                party_id="R002",
                party_name="Vasavi Medical Stores",
                invoice_no="INV-24022",
                invoice_date=today - timedelta(days=30),
                amount=12000.0,
                paid=7500.0,
                balance=4500.0,
                age=30,
                discount=0.0,
            ),
            models.OutstandingBill(
                owner_account_id=vajra.id,
                party_ref_id=vasavi_party.id if vasavi_party else None,
                party_id="R002",
                party_name="Vasavi Medical Stores",
                invoice_no="INV-24031",
                invoice_date=today - timedelta(days=18),
                amount=6300.0,
                paid=0.0,
                balance=6300.0,
                age=18,
                discount=200.0,
            ),
        ])

        order = models.Order(
            buyer_account_id=dattha.id, supplier_account_id=vajra.id,
            party_id=dattha_party.id if dattha_party else None,
            sales_rep_id=naresh.id, source="app", status="received",
        )
        total = gst = 0.0
        items = []
        for p, qty in [(vp[0], 10), (vp[1], 5)]:
            taxable = p.ptr_rate * qty
            g = round(taxable * p.gst_pct / 100, 2)
            lt = round(taxable + g, 2)
            total += lt
            gst += g
            items.append(models.OrderItem(
                product_id=p.id, qty=qty, free_qty=0, rate=p.ptr_rate,
                gst_pct=p.gst_pct, gst_amount=g, line_total=lt,
            ))
        order.items = items
        order.total_amount = round(total, 2)
        order.gst_amount = round(gst, 2)
        db.add(order)
        db.flush()
        order.order_no = f"GS{order.id:06d}"

        db.commit()
        print("Seed complete.")
        print("Accounts:", db.query(models.Account).count(),
              "| Users:", db.query(models.User).count(),
              "| Products:", db.query(models.Product).count(),
              "| Orders:", db.query(models.Order).count())
        print("Demo logins (password = demo1234): vajra, balaji, dattha, vasavi, naresh (sales rep)")
    finally:
        db.close()


if __name__ == "__main__":
    run()
