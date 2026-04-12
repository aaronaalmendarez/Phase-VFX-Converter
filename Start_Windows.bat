@echo off
setlocal

:: Set title and color
title Phase VFX Converter
color 0B

echo ====================================================
echo          PHASE VFX FLIPBOOK CONVERTER LAUNCHER      
echo ====================================================
echo.

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in your system PATH!
    echo Please install Python 3.10+ from python.org and ensure "Add Python to PATH" is checked.
    echo.
    pause
    exit /b
)

:: Check if virtual environment exists
if not exist venv\Scripts\activate.bat (
    echo [*] First time setup: Creating Virtual Environment...
    python -m venv venv
    
    echo [*] Activating Virtual Environment...
    call venv\Scripts\activate.bat
    
    echo [*] Installing dependencies. This might take a moment...
    pip install --upgrade pip
    pip install eel pillow requests
) else (
    :: Already exists, just activate
    call venv\Scripts\activate.bat
)

echo [*] Launching Phase Converter...
python app.py

:: Keep command prompt open if the app crashes
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] The application closed unexpectedly.
    pause
)

endlocal
