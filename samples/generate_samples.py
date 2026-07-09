"""Generate sample Excel files in this folder."""
from pathlib import Path

from openpyxl import Workbook

HERE = Path(__file__).parent


def save_sheet(filename: str, title: str, headers: list, rows: list[list]):
    wb = Workbook()
    ws = wb.active
    ws.title = title
    ws.append(headers)
    for row in rows:
        ws.append(row)
    wb.save(HERE / filename)
    print(f"Wrote {filename}")


def main():
    save_sheet(
        "products_stock_sample.xlsx",
        "Products",
        [
            "product_code",
            "name",
            "manufacturer",
            "pack_size",
            "hsn_code",
            "category",
            "mrp",
            "ptr_rate",
            "pts_rate",
            "gst_pct",
            "batch_no",
            "expiry_date",
            "available_qty",
            "scheme",
            "batch_mrp",
            "batch_ptr_rate",
        ],
        [
            [
                "P1001",
                "Dolo 650mg Tab",
                "Micro Labs",
                "15s",
                "30049099",
                "Analgesic",
                32.5,
                28.0,
                25.0,
                12,
                "DL2401",
                "2027-06-30",
                500,
                "10+1",
                32.5,
                28.0,
            ],
            [
                "P1001",
                "Dolo 650mg Tab",
                "Micro Labs",
                "15s",
                "30049099",
                "Analgesic",
                32.5,
                28.0,
                25.0,
                12,
                "DL2402",
                "2027-12-31",
                200,
                "",
                32.5,
                28.0,
            ],
            [
                "P1002",
                "Azithral 500mg Tab",
                "Alembic",
                "3s",
                "30042019",
                "Antibiotic",
                68.0,
                58.0,
                52.0,
                12,
                "AZ2501",
                "2026-11-30",
                120,
                "5+1",
                68.0,
                58.0,
            ],
        ],
    )

    save_sheet(
        "customers_sample.xlsx",
        "Customers",
        [
            "code",
            "name",
            "party_type",
            "address",
            "area",
            "city",
            "mobile",
            "dl_no",
            "gst_no",
            "sales_rep_name",
            "pricing_model",
        ],
        [
            [
                "R003",
                "Apollo Pharmacy",
                "customer",
                "Main Road, Ameerpet",
                "Ameerpet",
                "Hyderabad",
                "9876543210",
                "TS/HYD/20R-2003",
                "36APOLLO003Z1Z1",
                "M Naresh",
                "PTR",
            ],
            [
                "R004",
                "MedPlus Kukatpally",
                "customer",
                "KPHB Road",
                "Kukatpally",
                "Hyderabad",
                "9123456789",
                "TS/HYD/20R-2004",
                "36MEDPL004Z1Z2",
                "Suresh Kumar",
                "PTR",
            ],
        ],
    )

    save_sheet(
        "outstanding_sample.xlsx",
        "Outstanding",
        [
            "party_id",
            "party_name",
            "invoice_no",
            "invoice_date",
            "amount",
            "paid",
            "balance",
            "age",
            "discount",
        ],
        [
            [
                "R001",
                "Sri Dattha Central Pharmacy",
                "INV-24001",
                "2026-05-25",
                25000,
                8000,
                17000,
                45,
                0,
            ],
            [
                "R001",
                "Sri Dattha Central Pharmacy",
                "INV-24015",
                "2026-06-27",
                8500,
                1500,
                6850,
                12,
                150,
            ],
            [
                "R002",
                "Vasavi Medical Stores",
                "INV-24022",
                "2026-06-09",
                12000,
                7500,
                4500,
                30,
                0,
            ],
        ],
    )


if __name__ == "__main__":
    main()
