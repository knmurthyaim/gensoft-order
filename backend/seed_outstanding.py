"""Upsert demo outstanding bills (safe to run on existing database)."""
from datetime import date, timedelta

from app import crud, models, schemas
from app.database import Base, SessionLocal, engine

Base.metadata.create_all(bind=engine)


def upsert_outstanding_bills(db):
    vajra = (
        db.query(models.Account)
        .filter(models.Account.gensoft_code == "GS10001")
        .first()
    )
    if not vajra:
        print("Vajra account (GS10001) not found. Run seed.py first.")
        return

    today = date.today()
    bills = [
        schemas.OutstandingBillUploadItem(
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
        schemas.OutstandingBillUploadItem(
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
        schemas.OutstandingBillUploadItem(
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
        schemas.OutstandingBillUploadItem(
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
        schemas.OutstandingBillUploadItem(
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
    ]

    result = crud.upload_outstanding_bills(
        db,
        vajra,
        schemas.OutstandingBillUpload(replace_all=False, bills=bills),
    )
    print(
        f"Outstanding bills updated: {result.uploaded} ok, {result.failed} failed"
    )
    if result.errors:
        for err in result.errors:
            print(" ", err)

    total = (
        db.query(models.OutstandingBill)
        .filter(
            models.OutstandingBill.owner_account_id == vajra.id,
            models.OutstandingBill.balance > 0,
        )
        .count()
    )
    balance = sum(
        b.balance
        for b in db.query(models.OutstandingBill).filter(
            models.OutstandingBill.owner_account_id == vajra.id,
            models.OutstandingBill.balance > 0,
        )
    )
    print(f"Open bills: {total} | Total balance: {balance:,.2f}")


def main():
    db = SessionLocal()
    try:
        upsert_outstanding_bills(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
