from io import BytesIO
from typing import List

from openpyxl import load_workbook


def normalize_header(h: str) -> str:
    key = (h or "").strip().lower().replace(" ", "_")
    aliases = {
        "accounttype": "account_type",
        "business_name": "name",
        "businessname": "name",
        "customer_name": "name",
        "party_name": "name",
        "party_code": "code",
        "customer_code": "code",
        "customer_id": "party_id",
        "invoice_number": "invoice_no",
        "inv_no": "invoice_no",
        "inv_date": "invoice_date",
        "qty": "available_qty",
        "stock": "available_qty",
        "quantity": "available_qty",
        "expiry": "expiry_date",
        "exp_date": "expiry_date",
        "product_name": "name",
        "sku": "product_code",
        "gst": "gst_pct",
        "gst%": "gst_pct",
        "sales_rep": "sales_rep_name",
        "owner": "owner_name",
        "dlno": "dl_no",
        "gstno": "gst_no",
    }
    return aliases.get(key, key)


def parse_excel_upload(content: bytes) -> List[dict]:
    wb = load_workbook(BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    try:
        header_row = next(rows_iter)
    except StopIteration:
        wb.close()
        return []
    headers = [normalize_header(str(h or "")) for h in header_row]
    parsed = []
    for row in rows_iter:
        if not row or not any(cell is not None and str(cell).strip() for cell in row):
            continue
        item = {}
        for key, val in zip(headers, row):
            if key:
                item[key] = "" if val is None else val
        parsed.append(item)
    wb.close()
    return parsed
