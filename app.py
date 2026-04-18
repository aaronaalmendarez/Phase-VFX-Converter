import eel
import os
import io
import time
import requests
import base64
import json
import re
import site
import subprocess
import threading
from PIL import Image, ImageEnhance
import numpy as np
import cv2

try:
    import tkinter as tk
    from tkinter import filedialog
    tk_root = tk.Tk()
    tk_root.withdraw()
    tk_root.wm_attributes('-topmost', 1)
except Exception:
    tk_root = None

eel.init('web')

MODEL_SESSION_LOCK = threading.Lock()
MODEL_SESSION_CACHE = {}
DLL_DIRECTORY_HANDLES = []
REGISTERED_DLL_DIRS = set()
EXECUTION_MODE = "gpu"  # "gpu" or "cpu" — toggled from the frontend
SETTINGS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "user_settings.json")


def _load_settings_from_disk():
    """Read persisted user settings from disk."""
    if not os.path.exists(SETTINGS_FILE):
        return {}
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_settings_to_disk(data):
    """Write user settings to disk."""
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return True
    except Exception:
        return False


@eel.expose
def load_settings():
    """Return saved settings to the frontend on startup."""
    return _load_settings_from_disk()


@eel.expose
def save_settings(settings):
    """Persist settings from the frontend (API key, target ID, creator type)."""
    existing = _load_settings_from_disk()
    existing.update(settings)
    ok = _save_settings_to_disk(existing)
    return {"success": ok}


@eel.expose
def open_file_dialog(dialog_type="image"):
    if not tk_root:
        return None
    file_types = [("All Files", "*.*")]
    if dialog_type == "image":
        file_types = [
            ("Image Files", "*.png;*.jpg;*.jpeg;*.gif;*.bmp;*.webp;*.tiff;*.tif;*.ico;*.tga"),
            ("PNG", "*.png"),
            ("JPEG", "*.jpg;*.jpeg"),
            ("WebP", "*.webp"),
            ("GIF", "*.gif"),
            ("BMP", "*.bmp"),
            ("TIFF", "*.tiff;*.tif"),
            ("All Files", "*.*"),
        ]
    elif dialog_type == "video":
        file_types = [("Video Files", "*.mp4;*.avi;*.mov;*.mkv;*.gif")]
        
    filepath = filedialog.askopenfilename(filetypes=file_types)
    return filepath if filepath else None

@eel.expose
def save_file_dialog():
    if not tk_root:
        return None
    filepath = filedialog.asksaveasfilename(defaultextension=".png", filetypes=[("PNG Image", "*.png")])
    return filepath if filepath else None

@eel.expose
def load_local_image(filepath):
    try:
        img = Image.open(filepath)
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        b64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        return {"success": True, "image": f"data:image/png;base64,{b64}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

@eel.expose
def save_local_image(filepath, image_base64):
    try:
        header, encoded = image_base64.split(",", 1)
        img = Image.open(io.BytesIO(base64.b64decode(encoded)))
        img.save(filepath, format="PNG")
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

def assemble_images_to_b64(pil_images, cols):
    number_of_frames = len(pil_images)
    rows = (number_of_frames + cols - 1) // cols
    
    frame_w, frame_h = pil_images[0].size
    spritesheet = Image.new("RGBA", (frame_w * cols, frame_h * rows), (0,0,0,0))
    
    for i, frame in enumerate(pil_images):
        if frame.size != (frame_w, frame_h):
            frame = frame.resize((frame_w, frame_h))
        c = i % cols
        r = i // cols
        spritesheet.paste(frame, (c * frame_w, r * frame_h))
        
    buffered = io.BytesIO()
    spritesheet.save(buffered, format="PNG")
    b64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
    return {"success": True, "image": f"data:image/png;base64,{b64}"}

@eel.expose
def video_to_spritesheet(filepath, max_frames=64, cols=8):
    try:
        eel.update_progress(0, 1, "Reading video data...")
        frames = []
        if filepath.lower().endswith('.gif'):
            from PIL import ImageSequence
            gif = Image.open(filepath)
            seq = [frame.copy().convert("RGBA") for frame in ImageSequence.Iterator(gif)]
            total_frames_in_video = len(seq)
            if total_frames_in_video <= 0:
                return {"success": False, "error": "Could not read GIF or GIF is empty."}
            
            step = max(1, total_frames_in_video // max_frames)
            for i in range(min(max_frames, total_frames_in_video)):
                idx = i * step
                if idx >= len(seq): break
                frames.append(seq[idx])
                eel.update_progress(i, max_frames, f"Extracting GIF frame {i}/{total_frames_in_video}...")
        else:
            cap = cv2.VideoCapture(filepath)
            total_frames_in_video = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            if total_frames_in_video <= 0:
                return {"success": False, "error": "Could not read video or video is empty."}
                
            step = max(1, total_frames_in_video // max_frames)
            for i in range(max_frames):
                # Using cap.set is slow but fine for small videos
                cap.set(cv2.CAP_PROP_POS_FRAMES, i * step)
                ret, frame = cap.read()
                if not ret: break
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frames.append(Image.fromarray(frame).convert("RGBA"))
                eel.update_progress(i, max_frames, f"Extracting video frame {i}/{max_frames}...")
            cap.release()
        
        if not frames:
            return {"success": False, "error": "No frames could be extracted."}
            
        eel.update_progress(1, 1, "Assembling spritesheet...")
        return assemble_images_to_b64(frames, cols)
    except Exception as e:
        return {"success": False, "error": str(e)}

@eel.expose
def video_b64_to_spritesheet(b64_data, max_frames=64, cols=8, filename="temp.mp4"):
    import tempfile
    import os
    try:
        header, encoded = b64_data.split(",", 1)
        file_bytes = base64.b64decode(encoded)
        
        # Determine extension from filename to parse correctly (gif vs mp4)
        ext = os.path.splitext(filename)[1]
        if not ext: ext = ".mp4"
            
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_vid:
            temp_path = temp_vid.name
            temp_vid.write(file_bytes)
            
        res = video_to_spritesheet(temp_path, max_frames, cols)
        
        try:
            os.remove(temp_path)
        except:
            pass
            
        return res
    except Exception as e:
        return {"success": False, "error": str(e)}

@eel.expose
def dissect_spritesheet(image_base64, cols, rows):
    try:
        header, encoded = image_base64.split(",", 1)
        img = Image.open(io.BytesIO(base64.b64decode(encoded)))
        
        width, height = img.size
        frame_width = width // cols
        frame_height = height // rows
        
        frames_b64 = []
        for r in range(rows):
            for c in range(cols):
                left = c * frame_width
                top = r * frame_height
                right = left + frame_width
                bottom = top + frame_height
                
                frame = img.crop((left, top, right, bottom))
                buffered = io.BytesIO()
                frame.save(buffered, format="PNG")
                b64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
                frames_b64.append(f"data:image/png;base64,{b64}")
                
        return {"success": True, "frames": frames_b64}
    except Exception as e:
        return {"success": False, "error": str(e)}

@eel.expose
def edit_image(image_base64, adjustments):
    try:
        header, encoded = image_base64.split(",", 1)
        img = Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGBA")
        
        if "brightness" in adjustments:
            img = ImageEnhance.Brightness(img).enhance(adjustments["brightness"])
        if "contrast" in adjustments:
            img = ImageEnhance.Contrast(img).enhance(adjustments["contrast"])
        if "saturation" in adjustments:
            # Saturation enhancement in PIL is best done on RGB
            r,g,b,a = img.split()
            rgb_img = Image.merge("RGB", (r,g,b))
            rgb_img = ImageEnhance.Color(rgb_img).enhance(adjustments["saturation"])
            r,g,b = rgb_img.split()
            img = Image.merge("RGBA", (r,g,b,a))
        if "sharpness" in adjustments:
            img = ImageEnhance.Sharpness(img).enhance(adjustments["sharpness"])
            
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        b64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        return {"success": True, "image": f"data:image/png;base64,{b64}"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def _detect_gpu_info():
    """Auto-detect GPU name and VRAM via nvidia-smi."""
    info = {"name": None, "vram_mb": 0, "driver": None, "cuda_version": None, "is_rtx": False}
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
        )
        if result.returncode == 0 and result.stdout.strip():
            parts = [p.strip() for p in result.stdout.strip().split(",")]
            if len(parts) >= 3:
                info["name"] = parts[0]
                info["vram_mb"] = int(float(parts[1]))
                info["driver"] = parts[2]
                info["is_rtx"] = "RTX" in parts[0].upper()
    except Exception:
        pass

    # Get CUDA version from onnxruntime if available
    try:
        ort = _prepare_onnxruntime()
        providers = ort.get_available_providers()
        info["providers"] = providers
        info["has_cuda"] = "CUDAExecutionProvider" in providers
        info["has_dml"] = "DmlExecutionProvider" in providers
    except Exception:
        info["providers"] = ["CPUExecutionProvider"]
        info["has_cuda"] = False
        info["has_dml"] = False

    return info


_CACHED_GPU_INFO = None


@eel.expose
def get_gpu_info():
    """Return detected GPU info to the frontend on startup."""
    global _CACHED_GPU_INFO
    if _CACHED_GPU_INFO is None:
        _CACHED_GPU_INFO = _detect_gpu_info()
    return _CACHED_GPU_INFO


@eel.expose
def set_execution_mode(mode):
    """Toggle between 'gpu' and 'cpu'. Clears cached sessions so the next
    inference picks up the new provider list."""
    global EXECUTION_MODE, MODEL_SESSION_CACHE
    mode = mode.lower()
    if mode not in ("gpu", "cpu"):
        return {"success": False, "error": f"Unknown mode: {mode}"}

    EXECUTION_MODE = mode
    # Invalidate all cached ONNX sessions so they rebuild with new providers
    with MODEL_SESSION_LOCK:
        MODEL_SESSION_CACHE.clear()

    target = "GPU (CUDA / DirectML)" if mode == "gpu" else "CPU"
    print(f"[*] Execution mode set to: {target}")
    return {"success": True, "mode": mode, "target": target}


@eel.expose
def get_execution_mode():
    return EXECUTION_MODE


def _describe_execution_target(active_providers):
    if "DmlExecutionProvider" in active_providers:
        return "DirectML GPU"
    if "TensorrtExecutionProvider" in active_providers:
        return "TensorRT GPU"
    if "CUDAExecutionProvider" in active_providers:
        return "NVIDIA CUDA GPU"
    return "CPU"


def _get_provider_preference(ort):
    """Build provider list with optimised CUDA EP options.
    Respects the global EXECUTION_MODE toggle."""
    if EXECUTION_MODE == "cpu":
        return ["CPUExecutionProvider"]

    available = set(ort.get_available_providers())
    preferred = []

    # CUDA EP with performance-critical session options
    if "CUDAExecutionProvider" in available:
        cuda_opts = {
            # Use TF32 tensor-core math for FP32 ops (huge win on RTX 30xx / 40xx / 50xx)
            "use_tf32": 1,
            # HEURISTIC picks a good algo instantly; DEFAULT/EXHAUSTIVE compile every
            # candidate kernel on first run which is the source of the 30-60s stall.
            "cudnn_conv_algo_search": "HEURISTIC",
            # Give cuDNN the maximum workspace so the heuristic has room to pick fast algos
            "cudnn_conv_use_max_workspace": 1,
        }
        preferred.append(("CUDAExecutionProvider", cuda_opts))

    for provider in ("DmlExecutionProvider", "CPUExecutionProvider"):
        if provider in available:
            preferred.append(provider)

    return preferred or ["CPUExecutionProvider"]


def _expected_windows_gpu_dlls(ort):
    if os.name != "nt" or not hasattr(ort, "_get_nvidia_dll_paths"):
        return []

    site_roots = [path for path in site.getsitepackages() if os.path.isdir(path)]
    expected = []
    for dll_parts in ort._get_nvidia_dll_paths(is_windows=True, cuda=True, cudnn=True):
        dll_name = dll_parts[-1]
        present = any(os.path.exists(os.path.join(root, *dll_parts)) for root in site_roots)
        if not present:
            expected.append(dll_name)
    return expected


def _gpu_runtime_error_message(missing_dlls):
    missing = ", ".join(sorted(set(missing_dlls)))
    return (
        "GPU acceleration is unavailable because the CUDA/cuDNN runtime DLLs are missing "
        f"from this app environment: {missing}. Install the Windows GPU runtime packages "
        "into this venv with: pip install nvidia-cublas-cu12 nvidia-cuda-runtime-cu12 "
        "nvidia-cufft-cu12 nvidia-cudnn-cu12"
    )


def _add_windows_gpu_library_dirs():
    if os.name != "nt" or not hasattr(os, "add_dll_directory"):
        return

    site_roots = [path for path in site.getsitepackages() if os.path.isdir(path)]
    for root in site_roots:
        nvidia_root = os.path.join(root, "nvidia")
        if not os.path.isdir(nvidia_root):
            continue

        for package_name in os.listdir(nvidia_root):
            bin_dir = os.path.join(nvidia_root, package_name, "bin")
            if os.path.isdir(bin_dir) and bin_dir not in REGISTERED_DLL_DIRS:
                DLL_DIRECTORY_HANDLES.append(os.add_dll_directory(bin_dir))
                os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")
                REGISTERED_DLL_DIRS.add(bin_dir)


def _prepare_onnxruntime():
    import onnxruntime as ort

    _add_windows_gpu_library_dirs()
    if hasattr(ort, "preload_dlls"):
        ort.preload_dlls()

    return ort


def _validate_gpu_session(ort, active_providers):
    if any(provider in active_providers for provider in ("DmlExecutionProvider", "CUDAExecutionProvider", "TensorrtExecutionProvider")):
        return

    if os.name != "nt":
        return

    if ort.get_device() != "GPU":
        return

    missing_dlls = _expected_windows_gpu_dlls(ort)
    if missing_dlls:
        raise RuntimeError(_gpu_runtime_error_message(missing_dlls))


def _build_onnx_session(model_path):
    ort = _prepare_onnxruntime()
    # Enable all graph-level optimizations (constant folding, node fusion, etc.)
    sess_opts = ort.SessionOptions()
    sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    session = ort.InferenceSession(
        model_path, sess_options=sess_opts, providers=_get_provider_preference(ort)
    )
    _validate_gpu_session(ort, session.get_providers())
    return session


def _get_cached_model_session(cache_key, factory):
    if cache_key in MODEL_SESSION_CACHE:
        return MODEL_SESSION_CACHE[cache_key]

    with MODEL_SESSION_LOCK:
        if cache_key not in MODEL_SESSION_CACHE:
            MODEL_SESSION_CACHE[cache_key] = factory()
        return MODEL_SESSION_CACHE[cache_key]


def _get_rembg_session(model_name="u2net"):
    from rembg import new_session

    def factory():
        ort = _prepare_onnxruntime()
        session = new_session(model_name, providers=_get_provider_preference(ort))
        _validate_gpu_session(ort, session.inner_session.get_providers())
        return session

    return _get_cached_model_session(f"rembg:{model_name}", factory)


def run_birefnet_onnx(img, mask_params=None):
    from huggingface_hub import hf_hub_download
    import huggingface_hub.file_download as fd
    
    # 1. Custom tqdm to pipe progress to frontend
    class TqdmEelRedirect(fd.tqdm):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
        def update(self, n=1):
            super().update(n)
            if self.total and self.total > 0:
                mb_n = self.n / (1024*1024)
                mb_tot = self.total / (1024*1024)
                eel.update_progress(self.n, self.total, f"Downloading Model: {mb_n:.1f}MB / {mb_tot:.1f}MB")
                
    original_tqdm = fd.tqdm
    fd.tqdm = TqdmEelRedirect
    try:
        model_path = hf_hub_download(repo_id="onnx-community/BiRefNet-ONNX", filename="onnx/model.onnx")
    finally:
        fd.tqdm = original_tqdm
        
    load_target = "GPU memory" if EXECUTION_MODE == "gpu" else "CPU"
    eel.update_progress(1, 1, f"Loading ML Model into {load_target}...")
    session = _get_cached_model_session(f"birefnet:{model_path}", lambda: _build_onnx_session(model_path))
    active_providers = session.get_providers()
    execution_target = _describe_execution_target(active_providers)
    print(f"[*] ONNX mapped BiRefNet to: {execution_target}")
    eel.update_progress(1, 1, f"Running High-Res Segmentation on {execution_target}...")

    MODEL_RES = 1024
    orig_w, orig_h = img.size

    # ── Preserve existing alpha (spritesheets may already have transparency) ──
    orig_alpha = None
    if img.mode == "RGBA":
        orig_alpha = np.array(img.split()[3])

    # ── Apply mask refinement parameters ──
    if mask_params is None:
        mask_params = {}
    thresh_val = mask_params.get("threshold", 128)
    edge_strength = mask_params.get("edge_strength", 1)
    feather = mask_params.get("feather", 0)
    is_pixel_art = mask_params.get("pixel_art", False)

    # ── Preprocess: aspect-ratio-preserving resize with padding ──
    # Stretching non-square sprites to 1024x1024 distorts them and hurts segmentation.
    # Instead, we fit the image inside the square and pad with black.
    rgb_img = img.convert("RGB")
    scale = min(MODEL_RES / orig_w, MODEL_RES / orig_h)
    new_w, new_h = int(orig_w * scale), int(orig_h * scale)
    
    # NEAREST protects pixel art edges from blurring. LANCZOS is better for natural photos/VFX.
    resize_mode = Image.Resampling.NEAREST if is_pixel_art else Image.Resampling.LANCZOS
    resized = rgb_img.resize((new_w, new_h), resize_mode)

    # Pad to MODEL_RES x MODEL_RES (center the image on a black canvas)
    pad_left = (MODEL_RES - new_w) // 2
    pad_top = (MODEL_RES - new_h) // 2
    padded = Image.new("RGB", (MODEL_RES, MODEL_RES), (0, 0, 0))
    padded.paste(resized, (pad_left, pad_top))

    # Normalize with ImageNet stats
    im_arr = np.array(padded).astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    im_arr = (im_arr - mean) / std
    im_arr = np.transpose(im_arr, (2, 0, 1))  # HWC → CHW
    im_arr = np.expand_dims(im_arr, axis=0)    # add batch dim

    # ── Infer ──
    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: im_arr})
    pred = outputs[0]

    # ── Postprocess ──
    pred = np.squeeze(pred)
    # Sigmoid activation
    pred = 1.0 / (1.0 + np.exp(-np.clip(pred, -10, 10)))

    # Crop the padded region back to the actual image area
    pred = pred[pad_top:pad_top + new_h, pad_left:pad_left + new_w]

    mask_u8 = (pred * 255.0).clip(0, 255).astype(np.uint8)

    # ── Pixel Art vs Soft Thresholding ──
    if is_pixel_art:
        # Strictly binary mask: 0 or 255. No soft anti-aliased transitions that cause color bleed.
        mask_u8 = np.where(mask_u8 < thresh_val, 0, 255).astype(np.uint8)
    else:
        # Proportional mask: keeps soft edges. Pixels below half-threshold become 0.
        cutoff = max(1, thresh_val // 2)
        mask_u8 = np.where(mask_u8 < cutoff, 0, mask_u8).astype(np.uint8)

    # ── Morphological cleanup (controlled by edge_strength) ──
    if edge_strength > 0:
        # Closing: fill small holes inside particle/glow regions
        k_size = 1 + edge_strength * 2  # 3, 5, 7, 9, 11
        kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_size, k_size))
        mask_u8 = cv2.morphologyEx(mask_u8, cv2.MORPH_CLOSE, kernel_close, iterations=1)

        # Opening: remove tiny noise dots in the background
        k_open = max(1, edge_strength)
        kernel_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k_open, k_open))
        mask_u8 = cv2.morphologyEx(mask_u8, cv2.MORPH_OPEN, kernel_open, iterations=1)

    # ── Feather (Gaussian blur on mask edges) ──
    if feather > 0 and not is_pixel_art:
        blur_size = feather * 2 + 1  # must be odd: 1,3,5,7,...,21
        mask_u8 = cv2.GaussianBlur(mask_u8, (blur_size, blur_size), 0)

    # Resize mask back to original dimensions
    mask_img = Image.fromarray(mask_u8, mode="L")
    mask_img = mask_img.resize((orig_w, orig_h), resize_mode)

    # ── Compose final RGBA ──
    result = img.convert("RGBA")
    new_alpha = np.array(mask_img)

    # If the original image already had transparency, combine (intersection):
    # only keep pixels that both the original and the model agree should be visible.
    if orig_alpha is not None:
        combined = np.minimum(orig_alpha, new_alpha)
        result.putalpha(Image.fromarray(combined, mode="L"))
    else:
        result.putalpha(mask_img)

    return result

@eel.expose
def remove_background(image_base64, method="dark", threshold=30, mask_params=None):
    try:
        header, encoded = image_base64.split(",", 1)
        img = Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGBA")
        
        if mask_params is None:
            mask_params = {}

        eel.update_progress(0, 1, f"Running {method} bg removal...")
        if method == "rembg":
            from rembg import remove as rembg_remove

            session = _get_rembg_session("u2net")
            execution_target = _describe_execution_target(session.inner_session.get_providers())
            eel.update_progress(0, 1, f"Running rembg on {execution_target}...")
            img = rembg_remove(img, session=session)
        elif method == "birefnet":
            img = run_birefnet_onnx(img, mask_params=mask_params)
        else: # "dark" -> Unmultiply Black (Luma Key)
            # Perfect mathematical extraction for glowing/additive VFX on black
            arr = np.array(img).astype(np.float32)
            rgb = arr[:, :, :3]
            
            # Alpha is determined by the brightest color channel
            alpha = np.max(rgb, axis=2)
            
            # Avoid divide-by-zero on pure black pixels by clamping divisor
            alpha_safe = np.where(alpha == 0, 1.0, alpha)
            
            # Un-premultiply the RGB channels to restore original vividness
            # when rendered with the new soft alpha mask.
            rgb = (rgb / alpha_safe[:, :, None]) * 255.0
            
            # Reassemble into RGBA array
            arr[:, :, :3] = rgb.clip(0, 255)
            arr[:, :, 3] = alpha.clip(0, 255)
            
            img = Image.fromarray(arr.astype(np.uint8))
            
        eel.update_progress(1, 1, "Done.")
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        b64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
        return {"success": True, "image": f"data:image/png;base64,{b64}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@eel.expose
def fetch_and_slice(asset_id, cols, rows, target_id, is_group, api_key, name_prefix="Phase_VFX_Frame"):
    try:
        eel.update_progress(0, 1, f"Fetching Asset ID {asset_id} from Roblox servers...")
        res = requests.get(f"https://assetdelivery.roblox.com/v1/asset/?id={asset_id}")
        
        if res.status_code != 200:
            if res.status_code in (401, 403):
                return {"success": False, "error": "This asset is Private (Not 'Free to Copy'). Roblox blocks apps from downloading private assets without login cookies. You must make it public first, or use a local file."}
            return {"success": False, "error": f"Failed to fetch asset: {res.status_code}"}
            
        content = res.text
        if content.startswith("<roblox"):
            match = re.search(r'<url>(.*?)</url>', content)
            if not match:
                return {"success": False, "error": "Could not extract image URL from Decal XML."}
            image_url = match.group(1).replace("&amp;", "&")
            img_res = requests.get(image_url)
            if img_res.status_code != 200:
                return {"success": False, "error": f"Failed to fetch extracted image: {img_res.status_code}"}
            img_bytes = img_res.content
        else:
            img_bytes = res.content
            
        eel.update_progress(1, 1, "Image fetched successfully. Prepping for slicing...")
        
        b64_string = base64.b64encode(img_bytes).decode('utf-8')
        data_uri = f"data:image/png;base64,{b64_string}"
        
        return slice_and_upload(data_uri, cols, rows, target_id, is_group, api_key, name_prefix)
        
    except Exception as e:
        eel.log_error(str(e))
        return {"success": False, "error": str(e)}

@eel.expose
def slice_and_upload(image_base64, cols, rows, target_id, is_group, api_key, name_prefix="Phase_VFX_Frame"):
    try:
        header, encoded = image_base64.split(",", 1)
        image_data = base64.b64decode(encoded)
        img = Image.open(io.BytesIO(image_data))
        
        width, height = img.size
        frame_width = width // cols
        frame_height = height // rows
        
        total_frames = cols * rows
        asset_ids = []
        
        target_context = {
            "creator": {
                "groupId": str(target_id)
            } if is_group else {
                "userId": str(target_id)
            }
        }

        for r in range(rows):
            for c in range(cols):
                frame_number = (r * cols) + c + 1
                
                left = c * frame_width
                top = r * frame_height
                right = left + frame_width
                bottom = top + frame_height
                
                frame = img.crop((left, top, right, bottom))
                
                frame_io = io.BytesIO()
                frame.save(frame_io, format="PNG")
                frame_bytes = frame_io.getvalue()
                
                eel.update_progress(frame_number, total_frames, f"Uploading frame {frame_number}/{total_frames}...")
                
                url = "https://apis.roblox.com/assets/v1/assets"
                headers = {"x-api-key": api_key.strip()}
                
                config = {
                    "assetType": "Decal",
                    "creationContext": target_context,
                    "displayName": f"{name_prefix}_{frame_number}",
                    "description": "Uploaded via Phase-Flipbook-Editor"
                }
                
                files = {
                    "request": (None, json.dumps(config), "application/json"),
                    "fileContent": ("frame.png", frame_bytes, "image/png")
                }
                
                response = requests.post(url, headers=headers, files=files)
                
                if response.status_code == 200:
                    data = response.json()
                    if "assetId" in data:
                        asset_ids.append(data["assetId"])
                    elif "operationId" in data:
                        op_id = data["operationId"]
                        op_url = f"https://apis.roblox.com/assets/v1/operations/{op_id}"
                        resolved_id = None
                        for _ in range(20):
                            time.sleep(1)
                            op_res = requests.get(op_url, headers=headers)
                            if op_res.status_code == 200:
                                op_data = op_res.json()
                                if op_data.get("done") == True:
                                    resolved_id = op_data.get("response", {}).get("assetId")
                                    break
                        if resolved_id:
                            asset_ids.append(resolved_id)
                        else:
                            return {"success": False, "error": f"Timed out waiting for frame {frame_number}"}
                else:
                    return {"success": False, "error": f"Failed at frame {frame_number}: {response.status_code} - {response.text}"}
                time.sleep(0.2)
                
        eel.update_progress(total_frames, total_frames, "All frames uploaded successfully!")
        return {"success": True, "ids": asset_ids}

    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == '__main__':
    eel.start('index.html', size=(900, 650), port=0)
