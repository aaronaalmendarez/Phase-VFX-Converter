@echo off
setlocal
set "BASE_DEPS=eel pillow requests numpy opencv-python-headless rembg huggingface_hub onnxruntime-gpu"

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
)

echo [*] Activating Virtual Environment...
call venv\Scripts\activate.bat

python -c "import importlib.util, sys; required=['eel','PIL','requests','numpy','cv2','rembg','huggingface_hub']; import onnxruntime as ort; sys.exit(0 if all(importlib.util.find_spec(n) for n in required) and 'CUDAExecutionProvider' in ort.get_available_providers() else 1)" >nul 2>&1
if %errorlevel% neq 0 (
    echo [*] Installing / repairing app dependencies...
    pip install --upgrade pip
    pip uninstall -y onnxruntime onnxruntime-directml >nul 2>&1
    pip install %BASE_DEPS%
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
