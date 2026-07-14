@echo off
REM Build GenSoftUploader.exe (Windows)
cd /d "%~dp0"

if not exist venv (
  python -m venv venv
)

call venv\Scripts\activate.bat
pip install -r requirements.txt

pyinstaller --onefile --windowed --name GenSoftUploader ^
  --add-data "..\..\samples;samples" ^
  gensoft_upload.py

echo.
echo EXE created: dist\GenSoftUploader.exe
echo Copy config.example.ini to config.ini next to the EXE after first run.
pause
