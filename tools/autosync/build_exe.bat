@echo off
cd /d "%~dp0"
if not exist venv (
  python -m venv venv
)
call venv\Scripts\activate.bat
pip install -r requirements.txt
pip install -r ..\uploader\requirements.txt

copy /Y ..\uploader\gensoft_upload.py .\gensoft_upload.py >nul

pyinstaller --noconfirm --onefile --windowed --name GenSoftAutoSync ^
  --paths . ^
  --add-data "vfp;vfp" ^
  --hidden-import=pyodbc ^
  --hidden-import=openpyxl ^
  --hidden-import=requests ^
  --hidden-import=export_lamrin ^
  --hidden-import=export_files ^
  --hidden-import=gensoft_upload ^
  gensoft_autosync.py

if exist dist (
  copy /Y config.example.ini dist\config.ini >nul
  xcopy /E /I /Y vfp dist\vfp >nul
)

echo.
echo EXE: dist\GenSoftAutoSync.exe
echo Edit dist\config.ini — set source=external and [external] command to your VFP EXE/BAT.
pause
