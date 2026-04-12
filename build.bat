@echo off
echo Building PhaseConverter Desktop App...
call venv\Scripts\activate.bat
python -m eel app.py web --onefile --noconsole --name "PhaseConverter" --icon NONE
echo Build Complete! Check the "dist" folder.
pause
