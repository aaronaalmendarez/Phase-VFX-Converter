@echo off
setlocal enabledelayedexpansion

:: ============================================================
::  Phase VFX Flipbook Converter - One-Click Windows Installer
::  v2.0.0
:: ============================================================

title Phase VFX Converter - Installer
color 0B

echo.
echo  =====================================================
echo       PHASE VFX FLIPBOOK CONVERTER - INSTALLER
echo  =====================================================
echo.
echo  This will set up everything you need automatically.
echo  Press any key to begin, or close this window to cancel.
echo.
pause >nul

:: ------- Check Python -------
echo  [1/5] Checking for Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [!] Python is NOT installed or not in your PATH.
    echo.
    echo  Opening the Python download page for you...
    echo  IMPORTANT: Check "Add Python to PATH" during install!
    echo.
    start https://www.python.org/downloads/
    echo  After installing Python, close this window and run
    echo  this installer again.
    echo.
    pause
    exit /b 1
)
for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo  [OK] Python %PYVER% found.

:: ------- Create venv -------
echo.
echo  [2/5] Setting up virtual environment...
if not exist venv\Scripts\activate.bat (
    python -m venv venv
    if %errorlevel% neq 0 (
        echo  [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo  [OK] Virtual environment created.
) else (
    echo  [OK] Virtual environment already exists.
)
call venv\Scripts\activate.bat

:: ------- Install Dependencies -------
echo.
echo  [3/5] Installing dependencies (this may take a few minutes)...
pip install --upgrade pip >nul 2>&1

:: Clean conflicting onnxruntime packages
pip uninstall -y onnxruntime onnxruntime-directml >nul 2>&1

:: Core deps + CUDA GPU runtime
pip install eel pillow requests numpy opencv-python-headless rembg huggingface_hub onnxruntime-gpu
if %errorlevel% neq 0 (
    echo  [ERROR] Dependency installation failed.
    echo  Check your internet connection and try again.
    pause
    exit /b 1
)

:: Install CUDA/cuDNN runtime DLLs
pip install nvidia-cublas-cu12 nvidia-cuda-runtime-cu12 nvidia-cudnn-cu12 >nul 2>&1
echo  [OK] All dependencies installed.

:: ------- Verify GPU -------
echo.
echo  [4/5] Detecting GPU...
python -c "import onnxruntime as ort; provs = ort.get_available_providers(); print('    Providers:', provs); has_gpu = 'CUDAExecutionProvider' in provs or 'DmlExecutionProvider' in provs; print('    GPU Acceleration:', 'YES' if has_gpu else 'NO (CPU only)')"
echo  [OK] Runtime verified.

:: ------- Create Desktop Shortcut -------
echo.
echo  [5/5] Creating desktop shortcut...
set "SCRIPT_DIR=%~dp0"
set "SHORTCUT=%USERPROFILE%\Desktop\Phase VFX Converter.lnk"

:: Use PowerShell to create a proper .lnk shortcut
powershell -NoProfile -Command ^
    "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT%'); $s.TargetPath = '%SCRIPT_DIR%Start_Windows.bat'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Description = 'Phase VFX Flipbook Converter'; $s.IconLocation = '%SCRIPT_DIR%web\icons\phaselogo.png'; $s.Save()" >nul 2>&1

if exist "%SHORTCUT%" (
    echo  [OK] Shortcut created on Desktop.
) else (
    echo  [!] Could not create shortcut. You can run Start_Windows.bat directly.
)

:: ------- Done -------
echo.
echo  =====================================================
echo       INSTALLATION COMPLETE!
echo  =====================================================
echo.
echo  To launch: Double-click "Phase VFX Converter" on
echo  your Desktop, or run Start_Windows.bat directly.
echo.
echo  Features:
echo    - GPU-accelerated AI background removal (RTX)
echo    - BiRefNet Pro AI segmentation
echo    - Spritesheet editor with live animation preview
echo    - Direct Roblox asset upload
echo.
pause
