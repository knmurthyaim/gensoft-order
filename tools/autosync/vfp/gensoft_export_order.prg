* GenSoft Order — VFP 6 export helper
* Creates TAB-delimited text files that GenSoftAutoSync converts + uploads to cloud.
*
* REQUIRED: set paths and open your live tables / SELECT the columns as shown.
* Then from VFP:  DO gensoft_export_order
*
* Output folder (must match Auto Sync "Export folder"):
*   C:\GenSoftExports\customers.txt
*   C:\GenSoftExports\products_stock.txt
*   C:\GenSoftExports\outstanding.txt
*
* Column names must stay exactly as below (first row = headers).

LOCAL lcOut
lcOut = "C:\GenSoftExports\"
IF NOT DIRECTORY(lcOut)
    MD (lcOut)
ENDIF

* ---- 1) CUSTOMERS / PARTIES ----
* Adjust USE / SELECT fields to match YOUR VFP party DBF names.
* Example assumes a table PARTY with common GenSoft fields — rename as needed.

* USE party IN 0 SHARED
* SELECT ;
*     ALLTRIM(code) AS code, ;
*     ALLTRIM(name) AS name, ;
*     "customer" AS party_type, ;
*     ALLTRIM(address) AS address, ;
*     ALLTRIM(area) AS area, ;
*     ALLTRIM(city) AS city, ;
*     ALLTRIM(mobile) AS mobile, ;
*     ALLTRIM(dlno) AS dl_no, ;
*     ALLTRIM(gstno) AS gst_no, ;
*     ALLTRIM(repname) AS sales_rep_name, ;
*     "PTR" AS pricing_model ;
*   FROM party ;
*   INTO CURSOR csrCust
*
* COPY TO (lcOut + "customers.txt") TYPE DELIMITED WITH TAB

* ---- 2) PRODUCTS + STOCK (one row per batch) ----
* USE product IN 0 SHARED
* USE stock IN 0 SHARED
* SELECT ... INTO CURSOR csrProd
* COPY TO (lcOut + "products_stock.txt") TYPE DELIMITED WITH TAB
*
* Header row must be:
* product_code, name, manufacturer, pack_size, hsn_code, category,
* mrp, ptr_rate, pts_rate, gst_pct, batch_no, expiry_date, available_qty,
* scheme, batch_mrp, batch_ptr_rate

* ---- 3) OUTSTANDING ----
* COPY TO (lcOut + "outstanding.txt") TYPE DELIMITED WITH TAB
*
* Header row:
* party_id, party_name, invoice_no, invoice_date, amount, paid, balance, age, discount

MESSAGEBOX("Edit this PRG to USE your live DBFs, then COPY TO C:\GenSoftExports\*.txt" + CHR(13) + ;
    "After that, GenSoft Auto Sync (source = Run EXE / VFP) will upload automatically.", ;
    64, "GenSoft VFP export")

RETURN
