@echo off
REM ============================================================
REM Put this BAT in the SAME folder as GenSoftSync.exe
REM Your PRG should write Excel files into THIS folder (%~dp0).
REM ============================================================

cd /d "%~dp0"
set OUT=%~dp0

REM --- EDIT THESE TWO LINES ---
set VFP6="C:\Program Files (x86)\Microsoft Visual Studio\VFP98\VFP6.EXE"
set PRG=C:\YourBilling\gensoft_export_order.prg

REM Run the PRG (closes when done)
%VFP6% -C DO %PRG%

if errorlevel 1 (
  echo VFP export failed
  exit /b 1
)

echo Export done. Files should be in %OUT%
exit /b 0
