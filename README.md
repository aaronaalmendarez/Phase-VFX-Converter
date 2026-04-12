<div align="center">
  <img src="https://raw.githubusercontent.com/aaronaalmendarez/Phase-VFX-Converter/main/web/icons/icon.png" width="80" alt="Phase VFX Logo" />
  <h1>Phase VFX Flipbook Converter</h1>
  <p><b>The ultimate companion app for VFXForge. Seamlessly slice, upload, and import spritesheets directly into your Roblox Studio VFX library.</b></p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](https://opensource.org/licenses/MIT)
  [![Made for Roblox](https://img.shields.io/badge/Roblox-VFXForge-black?logo=roblox)](https://create.roblox.com/)
</div>

<br>

Welcome to the **Phase VFX Flipbook Converter**! This lightweight desktop tool connects with Roblox's Open Cloud API to securely upload large spritesheets directly into your Roblox inventory. It automatically slices your massive flipbooks into sequential frames and spits out an array of IDs that natively pastes into the VFXForge plugin. 

---

## ⚡ 1-Click Install (Easiest Method)

If you don't want to deal with code, terminals, or manual setups, use this method!

#### 🖥️ For Windows Users
1. Go to the [**Releases Tab**](../../releases) on the right side of this screen.
2. Download the `Source code (zip)`.
3. Extract the folder to your Desktop.
4. Double-click the **`Start_Windows.bat`** file. 
> *It will automatically install everything it needs and launch the app beautifully!*

#### 🍎 For Mac Users
1. Go to the [**Releases Tab**](../../releases) on the right side of this screen.
2. Download the `Source code (zip)`.
3. Extract the folder to somewhere safe.
4. Double-click the **`Start_Mac.command`** file.
> *If your Mac tells you it doesn't have permission to run, simply right click `Start_Mac.command` -> Open With -> Terminal.*

*(Note: Both platforms require [Python](https://www.python.org/downloads/) to be installed prior to running the launchers! When installing Python on Windows, make sure you manually check the box that says "Add python.exe to PATH" at the bottom of the installer!)*

---

## 🚀 How To Use

Using the tool is incredibly straightforward.

### 1. Get an Open Cloud API Key 🔑
1. Go to the [Roblox Creator Dashboard: Credentials](https://create.roblox.com/dashboard/credentials).
2. Click **Create API Key**.
3. Under **Access Permissions**, add the **Assets API** and give it `Write` permissions for `Decals`.
4. Copy the long API Key it gives you into the Converter Box.

### 2. Enter your Target ID 🎯
* **Creator Type:** Are you uploading this for an individual User, or a Group?
* **Creator ID:** Your Roblox User ID or your Group's ID (found in the URL when looking at your profile).

### 3. Slice and Upload ✂️
Upload your `.PNG` Spritesheet, type in how many Rows and Columns the image has, and hit **Slice & Upload!** 

The app will securely communicate with Roblox and upload every individual frame as a native Decal to your account. 

### 4. Paste to VFXForge! 🪄
Once finished, the app will give you a neat little `[ Copy IDs ]` button. Click it, go to Roblox Studio, click the **Importer Tab** inside Phase VFX, and paste! All of your frames will instantly categorize themselves into your personal flipbook library! 

---

## 💻 Developer Installation

If you prefer using your terminal or want to contribute to the code, simply run:

```bash
# Clone the Repo
git clone https://github.com/aaronaalmendarez/Phase-VFX-Converter.git
cd Phase-VFX-Converter

# Install Requirements
pip install eel pillow requests

# Run
python app.py
```

### Compiling to an Executable (\`.exe\` / \`.app\`)
If you want to bake the application into a single executable that you can move around like a real program:
```bash
pip install pyinstaller
python -m eel app.py web --onefile --noconsole --name "PhaseConverter" --icon NONE
```

---
<div align="center">
  <sub>Developed natively for the Phase VFX Ecosystem across Roblox Studio.</sub>
</div>
