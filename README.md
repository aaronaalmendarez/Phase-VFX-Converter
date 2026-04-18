<div align="center">
  <img src="web/icons/phaselogo.png" width="80" alt="Phase VFX Logo" />
  <h1>Phase VFX Flipbook Converter</h1>
  <p><b>The ultimate companion app for Phase VFX. GPU-accelerated AI background removal, spritesheet editing, and direct Roblox upload.</b></p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)
  [![Made for Roblox](https://img.shields.io/badge/Roblox-Phase_VFX-black?logo=roblox)](https://create.roblox.com/store/asset/78798609925417/Phase-VFX)
  [![GPU Accelerated](https://img.shields.io/badge/GPU-CUDA%20%7C%20RTX-76b900?logo=nvidia)](https://developer.nvidia.com/cuda-toolkit)
</div>

<br>

Welcome to the **Phase VFX Flipbook Converter v2.0**! This desktop tool connects with Roblox's Open Cloud API to upload spritesheets directly into your inventory with GPU-accelerated AI processing.

### ✨ What's New in v2.0

- **🎮 GPU-Accelerated AI** — NVIDIA CUDA + RTX tensor core acceleration for instant background removal
- **🧠 BiRefNet Pro AI** — State-of-the-art segmentation model for high-res character/FX extraction
- **⚡ GPU/CPU Toggle** — Switch execution modes on-the-fly with automatic session rebuilding
- **🔍 Auto GPU Detection** — Detects your GPU model, VRAM, and driver on startup
- **🔔 Toast Notifications** — Color-coded floating alerts for GPU, AI, download, and error events
- **📊 Live GPU Status Chip** — Persistent bottom-bar indicator showing active compute backend
- **🎬 Video Import** — Extract frames from MP4/AVI/MOV/GIF into spritesheets
- **🖼️ Image Filters** — Brightness, contrast, saturation, sharpness with presets
- **↩️ Undo System** — Multi-level undo history for all image operations

<div align="center">
  <br>
  <img src="images/main_screen.png" width="600" alt="Phase VFX Converter Desktop App" />
  <br>
</div>

---

## ⚡ 1-Click Install (Windows)

1. Go to the [**Releases Tab**](../../releases) on the right side of this screen.
2. Download **`Install_Windows.bat`** and the **`Source code (zip)`**.
3. Extract the source code zip to a folder.
4. Place `Install_Windows.bat` inside the extracted folder (if not already there).
5. **Double-click `Install_Windows.bat`** — it will:
   - ✅ Check for Python (opens download page if missing)
   - ✅ Create an isolated virtual environment
   - ✅ Install all dependencies + CUDA GPU runtime
   - ✅ Detect your GPU and verify acceleration
   - ✅ Create a Desktop shortcut

> **GPU Support:** NVIDIA RTX GPUs are auto-detected and used for AI acceleration via CUDA. Non-NVIDIA systems gracefully fall back to CPU.

#### 🍎 Mac Support
Coming soon in a future release.

---

## 🛠️ Manual Installation

If you prefer running from source directly:
1. Download the `Source code (zip)` from Releases and extract it.
2. Double-click **`Start_Windows.bat`** (Windows) or **`Start_Mac.command`** (macOS).

> Requires [Python 3.10+](https://www.python.org/downloads/) installed with "Add Python to PATH" checked.

---

## 🚀 How To Use

### 1. Get an Open Cloud API Key 🔑
1. Go to the [Roblox Creator Dashboard: Credentials](https://create.roblox.com/dashboard/credentials).
2. Click **Create API Key**.
3. Under **Access Permissions**, add the **Assets API** and give it `Write` permissions for `Decals`.
4. Copy the API Key into the Converter.

### 2. Enter your Target ID 🎯
* **Creator Type:** User or Group
* **Creator ID:** Your Roblox User ID or Group ID (found in the URL of your profile page).

### 3. Import & Edit 🖼️
- **Browse Image** or **drag & drop** a spritesheet
- **Browse Video** to auto-extract frames into a spritesheet
- **Remove BG tab** — Use Pro AI (BiRefNet), AI (Rembg), or legacy dark-pixel removal
- **Filters tab** — Adjust brightness, contrast, saturation, sharpness with presets
- **GPU/CPU toggle** — Switch between GPU acceleration and CPU processing

### 4. Slice & Upload ✂️
Set your grid rows/columns, hit **Slice & Upload**, and the app will upload every frame as a Decal to your Roblox account.

### 5. Paste to Phase VFX! 🪄
Click **Copy IDs**, open Phase VFX in Roblox Studio, go to the **Importer Tab**, and paste!

<div align="center">
  <br>
  <img src="images/plugin_importer.png" width="600" alt="Phase VFX Plugin Importer UI" />
  <br>
</div>

---

## 💻 Developer Installation

```bash
# Clone the Repo
git clone https://github.com/aaronaalmendarez/Phase-VFX-Converter.git
cd Phase-VFX-Converter

# Create venv & install
python -m venv venv
venv\Scripts\activate        # Windows
pip install eel pillow requests numpy opencv-python-headless rembg huggingface_hub onnxruntime-gpu
pip install nvidia-cublas-cu12 nvidia-cuda-runtime-cu12 nvidia-cudnn-cu12

# Run
python app.py
```

---
<div align="center">
  <sub>Developed natively for the Phase VFX Ecosystem across Roblox Studio.</sub>
</div>
