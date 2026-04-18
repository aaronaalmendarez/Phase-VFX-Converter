@echo off
echo Building PhaseConverter Desktop App...
call venv\Scripts\activate.bat
pip install --upgrade pip
pip uninstall -y onnxruntime onnxruntime-directml >nul 2>&1
pip install pyinstaller eel pillow requests numpy opencv-python-headless rembg huggingface_hub onnxruntime-gpu
pyinstaller PhaseConverter.spec --noconfirm
echo Build Complete! Check the "dist" folder.
pause
