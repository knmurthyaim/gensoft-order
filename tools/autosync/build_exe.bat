@echo off
cd /d "%~dp0"

if not exist venv (
  python -m venv venv
)
call venv\Scripts\activate.bat
pip install -r requirements.txt
pip install -r ..\uploader\requirements.txt

copy /Y ..\uploader\gensoft_upload.py .\gensoft_upload.py >nul

echo Building GenSoftSync.exe (one file)...
pyinstaller --noconfirm --onefile --windowed --name GenSoftSync ^
  --paths . ^
  --hidden-import=openpyxl ^
  --hidden-import=xlrd ^
  --hidden-import=requests ^
  --hidden-import=export_files ^
  --hidden-import=gensoft_upload ^
  gensoft_autosync.py

if exist dist (
  copy /Y config.example.ini dist\config.ini >nul
  copy /Y vfp\run_vfp_export.bat dist\run_vfp_export.bat >nul
  echo.
  echo ========================================
  echo  DONE — put ALL of these in ONE folder:
  echo    GenSoftSync.exe
  echo    config.ini
  echo    run_vfp_export.bat
  echo  Excel files are created in that same folder.
  echo ========================================
  echo.
  echo 1. Edit config.ini  (username, password)
  echo 2. Edit run_vfp_export.bat  (VFP6 path + your .PRG path)
  echo 3. Run GenSoftSync.exe → Start with Windows
)

pause
