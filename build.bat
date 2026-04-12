@echo off
echo Building PhaseConverter Desktop App...
call venv\Scripts\activate.bat
pyinstaller --onefile --noconsole --name "PhaseConverter" --icon NONE --add-data "web;web" app.py
echo Build Complete! Check the "dist" folder.
pause
