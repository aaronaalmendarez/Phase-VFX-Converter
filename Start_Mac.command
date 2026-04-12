#!/bin/bash
# Phase VFX Flipbook Converter - MacOS / Linux Launcher

# Change directory to where the script is located
cd "$(dirname "$0")"

echo "===================================================="
echo "          PHASE VFX FLIPBOOK CONVERTER LAUNCHER      "
echo "===================================================="
echo ""

# Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python 3 was not found on your system."
    echo "Please download and install it from python.org"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

# Check if Virtual Environment exists
if [ ! -f "venv/bin/activate" ]; then
    echo "[*] First time setup: Creating Virtual Environment..."
    python3 -m venv venv
    
    echo "[*] Activating Virtual Environment..."
    source venv/bin/activate
    
    echo "[*] Installing dependencies. This might take a moment..."
    pip install --upgrade pip
    pip install eel pillow requests
else
    # Already exists, just activate
    source venv/bin/activate
fi

echo "[*] Launching Phase Converter..."
python3 app.py

# Keep terminal open on error
if [ $? -ne 0 ]; then
    echo ""
    echo "[ERROR] The application closed unexpectedly."
    read -p "Press Enter to exit..."
fi
