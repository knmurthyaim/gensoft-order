@echo off
REM Sample: call your VFP-built export EXE, then leave files in C:\GenSoftExports
REM Point GenSoft Auto Sync [external] command = this BAT file.

set OUT=C:\GenSoftExports
if not exist "%OUT%" mkdir "%OUT%"

REM --- Option A: your billing EXE that already creates the three files ---
REM "C:\YourBilling\ExportToGenSoft.exe" "%OUT%"

REM --- Option B: run VFP 6 with the export PRG (edit path to VFP6.EXE) ---
REM "C:\Program Files (x86)\Microsoft Visual Studio\VFP98\VFP6.EXE" -C"C:\GenSoft\config.fpw" DO C:\path\to\gensoft_export_order.prg

echo Place customers.xlsx / products_stock.xlsx / outstanding.xlsx (or .txt) in %OUT%
echo Then Auto Sync will upload them.
exit /b 0
