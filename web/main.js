// ============================================
//  PHASE FLIPBOOK EDITOR — Frontend Logic
// ============================================

// ---- State ----
let originalImageB64 = null;
let currentImageB64 = null;
let uploadedAssetIds = [];
let imageHistory = [];

function saveUndoState() {
    if (currentImageB64) {
        imageHistory.push(currentImageB64);
        if (imageHistory.length > 20) imageHistory.shift(); // Limit stack size
    }
}

// ---- DOM Helpers ----
const $ = id => document.getElementById(id);
const canvas = $('preview-canvas');
const ctx = canvas.getContext('2d');
const animCanvas = $('anim-canvas');
const animCtx = animCanvas.getContext('2d');

// ---- Animation State ----
let animTimer = null;
let currentFrame = 0;
let isPlaying = true;

// ---- Camera State ----
let camX = 0, camY = 0, camZoom = 1;
let isPanning = false, startX, startY;
const viewportLayer = document.getElementById('canvas-transform-layer');
const viewportContainer = document.getElementById('canvas-viewport');

// SVG Icons
const SVG_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 4l15 8-15 8z"></path></svg>';
const SVG_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 4h4v16H6zm8 0h4v16h-4z"></path></svg>';

// ============================================
//  TAB NAVIGATION
// ============================================
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        $(`tab-${btn.dataset.tab}`).classList.add('active');
    });
});

// ============================================
//  GPU AUTO-DETECT + MODE TOGGLE
// ============================================
let detectedGpuInfo = null;

async function initGpuInfo() {
    try {
        const info = await eel.get_gpu_info()();
        detectedGpuInfo = info;

        const nameEl = $('gpu-info-name');
        const detailEl = $('gpu-info-detail');
        const card = $('gpu-info-card');
        const chip = $('gpu-status-chip');

        if (info.name) {
            nameEl.textContent = info.name;
            const vram = info.vram_mb >= 1024
                ? (info.vram_mb / 1024).toFixed(0) + ' GB VRAM'
                : info.vram_mb + ' MB VRAM';
            let detail = vram;
            if (info.driver) detail += ` · Driver ${info.driver}`;
            detailEl.textContent = detail;

            if (info.is_rtx) {
                card.classList.add('gpu-card-rtx');
                nameEl.innerHTML = `<img class="rtx-badge" src="icons/rtx-badge.png" alt="RTX"> ${info.name.replace(/NVIDIA\s*GeForce\s*/i, '')}`;
            }

            // Update bottom bar chip
            if (info.has_cuda && chip) {
                chip.className = 'gpu-chip gpu-chip-cuda';
                chip.querySelector('span').textContent = 'CUDA · ' + info.name.replace(/NVIDIA\s*GeForce\s*/i, '');
            } else if (info.has_dml && chip) {
                chip.className = 'gpu-chip gpu-chip-dml';
                chip.querySelector('span').textContent = 'DirectML';
            }

            log(`GPU detected: ${info.name} (${vram})`);
        } else {
            nameEl.textContent = 'No GPU Detected';
            detailEl.textContent = 'AI will run on CPU';
            card.classList.add('gpu-card-none');
            if (chip) {
                chip.className = 'gpu-chip gpu-chip-cpu';
                chip.querySelector('span').textContent = 'CPU Only';
            }
        }

        // Disable GPU button if no GPU providers
        if (!info.has_cuda && !info.has_dml) {
            const gpuBtn = $('mode-gpu');
            gpuBtn.disabled = true;
            gpuBtn.classList.remove('active');
            $('mode-cpu').classList.add('active');
        }
    } catch (e) {
        console.warn('GPU detection failed:', e);
        $('gpu-info-name').textContent = 'Detection Failed';
    }
}

// Mode toggle buttons
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        const mode = btn.dataset.mode;
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const res = await eel.set_execution_mode(mode)();
        if (res.success) {
            log(`Execution mode: ${res.target}`);
            const chip = $('gpu-status-chip');
            if (mode === 'cpu') {
                chip.className = 'gpu-chip gpu-chip-cpu';
                chip.querySelector('span').textContent = 'CPU Mode';
            } else if (detectedGpuInfo) {
                if (detectedGpuInfo.has_cuda) {
                    chip.className = 'gpu-chip gpu-chip-cuda';
                    chip.querySelector('span').textContent = 'CUDA · ' + (detectedGpuInfo.name || 'GPU').replace(/NVIDIA\s*GeForce\s*/i, '');
                } else if (detectedGpuInfo.has_dml) {
                    chip.className = 'gpu-chip gpu-chip-dml';
                    chip.querySelector('span').textContent = 'DirectML';
                }
            }
        }
    });
});

// Fire GPU detection after eel is ready
setTimeout(initGpuInfo, 300);

// ============================================
//  SETTINGS PERSISTENCE (API key, target ID)
// ============================================
async function initSettings() {
    try {
        const s = await eel.load_settings()();
        if (s.api_key) $('api-key').value = s.api_key;
        if (s.target_id) $('target-id').value = s.target_id;
        if (s.creator_type) {
            const radio = document.querySelector(`input[name="creator_type"][value="${s.creator_type}"]`);
            if (radio) radio.checked = true;
        }
    } catch (e) {
        console.warn('Failed to load settings:', e);
    }
}

function saveSettingsDebounced() {
    clearTimeout(saveSettingsDebounced._timer);
    saveSettingsDebounced._timer = setTimeout(() => {
        const creatorRadio = document.querySelector('input[name="creator_type"]:checked');
        eel.save_settings({
            api_key: $('api-key').value,
            target_id: $('target-id').value,
            creator_type: creatorRadio ? creatorRadio.value : 'User'
        })();
    }, 500);
}

// Auto-save on input change
$('api-key').addEventListener('input', saveSettingsDebounced);
$('target-id').addEventListener('input', saveSettingsDebounced);
document.querySelectorAll('input[name="creator_type"]').forEach(r => {
    r.addEventListener('change', saveSettingsDebounced);
});

// Load settings on startup
setTimeout(initSettings, 400);

// ============================================
//  CANVAS RENDERING
// ============================================
function updateCanvas(b64) {
    if (!b64) return;
    currentImageB64 = b64;
    const img = new Image();
    img.onload = () => {
        $('canvas-placeholder').classList.add('hidden');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        drawGrid(img.width, img.height);
        updateStatBar(img.width, img.height);
        
        // Reset Camera to fit
        const vw = viewportContainer.clientWidth;
        const vh = viewportContainer.clientHeight;
        const scale = Math.min((vw - 40) / img.width, (vh - 40) / img.height);
        camZoom = Math.min(1, scale);
        camX = (vw - img.width * camZoom) / 2;
        camY = (vh - img.height * camZoom) / 2;
        updateTransform();
        
        startAnim();
    };
    img.src = b64;
}

function updateTransform() {
    if(viewportLayer) {
        viewportLayer.style.transform = `translate(${camX}px, ${camY}px) scale(${camZoom})`;
    }
}

// ---- Pan and Zoom Logic ----
if (viewportContainer) {
    viewportContainer.addEventListener('wheel', e => {
        if (!currentImageB64) return;
        e.preventDefault();
        const zoomDir = Math.sign(e.deltaY) > 0 ? 0.85 : 1.15;
        
        // Zoom relative to pointer
        const rect = viewportContainer.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        
        const oldWx = (mx - camX) / camZoom;
        const oldWy = (my - camY) / camZoom;
        
        camZoom *= zoomDir;
        camZoom = Math.max(0.05, Math.min(camZoom, 50));
        
        camX = mx - oldWx * camZoom;
        camY = my - oldWy * camZoom;
        updateTransform();
    }, { passive: false });

    viewportContainer.addEventListener('mousedown', e => {
        if (!currentImageB64) return;
        isPanning = true;
        startX = e.clientX - camX;
        startY = e.clientY - camY;
        viewportContainer.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
        if (!isPanning) return;
        camX = e.clientX - startX;
        camY = e.clientY - startY;
        updateTransform();
    });
    window.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            viewportContainer.style.cursor = 'grab';
        }
    });
}

function drawGrid(w, h) {
    const cols = parseInt($('grid-cols').value) || 1;
    const rows = parseInt($('grid-rows').value) || 1;
    const cw = w / cols;
    const ch = h / rows;

    // Helper to trace all grid lines into the current path
    function tracePaths() {
        for (let c = 1; c < cols; c++) {
            ctx.moveTo(c * cw, 0);
            ctx.lineTo(c * cw, h);
        }
        for (let r = 1; r < rows; r++) {
            ctx.moveTo(0, r * ch);
            ctx.lineTo(w, r * ch);
        }
    }

    ctx.save();

    // Pass 1: Dark outline (solid, wider) — guarantees visibility on light/transparent areas
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.beginPath();
    tracePaths();
    ctx.stroke();

    // Pass 2: Bright dashed core — guarantees visibility on dark areas
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.85)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    tracePaths();
    ctx.stroke();

    ctx.restore();
}

function updateStatBar(w, h) {
    const cols = parseInt($('grid-cols').value) || 1;
    const rows = parseInt($('grid-rows').value) || 1;
    $('stat-size').textContent = `${w} × ${h}`;
    $('stat-frames').textContent = `${cols * rows}`;
    $('stat-bar').style.display = 'flex';
}

// ============================================
//  ANIMATION PREVIEW
// ============================================
function startAnim() {
    if (animTimer) clearInterval(animTimer);
    if (!currentImageB64 || !isPlaying) return;

    const cols = parseInt($('grid-cols').value) || 1;
    const rows = parseInt($('grid-rows').value) || 1;
    const fps  = parseInt($('anim-fps').value) || 30;

    const img = new Image();
    img.src = currentImageB64;

    animTimer = setInterval(() => {
        if (!img.complete || img.naturalWidth === 0) return;

        const fw = img.width / cols;
        const fh = img.height / rows;
        const total = cols * rows;
        currentFrame = (currentFrame + 1) % total;

        const r = Math.floor(currentFrame / cols);
        const c = currentFrame % cols;

        animCanvas.width = 48;
        animCanvas.height = 48;
        animCtx.clearRect(0, 0, 48, 48);
        animCtx.drawImage(img, c * fw, r * fh, fw, fh, 0, 0, 48, 48);

        // Render to modal if active
        const modal = $('anim-modal');
        if (!modal.classList.contains('hidden')) {
            const mCanvas = $('anim-modal-canvas');
            const mCtx = mCanvas.getContext('2d');
            
            // Calculate a good enlarged size (up to 400px but respecting aspect ratio)
            const maxDim = 512;
            const scale = Math.min(maxDim / fw, maxDim / fh);
            const wScaled = fw * scale;
            const hScaled = fh * scale;

            if (mCanvas.width !== wScaled || mCanvas.height !== hScaled) {
                mCanvas.width = wScaled;
                mCanvas.height = hScaled;
                mCtx.imageSmoothingEnabled = false; // pixel art scaling
            }

            mCtx.clearRect(0, 0, wScaled, hScaled);
            mCtx.drawImage(img, c * fw, r * fh, fw, fh, 0, 0, wScaled, hScaled);
        }
    }, 1000 / fps);
}

$('grid-cols').onchange = () => { if (currentImageB64) updateCanvas(currentImageB64); };
$('grid-rows').onchange = () => { if (currentImageB64) updateCanvas(currentImageB64); };
$('anim-fps').onchange  = startAnim;

$('btn-play-pause').onclick = () => {
    isPlaying = !isPlaying;
    $('btn-play-pause').innerHTML = isPlaying ? SVG_PAUSE : SVG_PLAY;
    if (isPlaying) startAnim();
    else if (animTimer) { clearInterval(animTimer); animTimer = null; }
};

// ============================================
//  DRAG AND DROP
// ============================================
const dropOverlay = $('drop-zone-overlay');

document.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes("Files")) {
        dropOverlay.classList.remove('hidden');
    }
});

// ============================================
//  MODAL LOGIC
// ============================================
$('btn-enlarge-anim').onclick = () => {
    if (!currentImageB64) return;
    $('anim-modal').classList.remove('hidden');
    startAnim();
};

const closeModal = () => {
    $('anim-modal').classList.add('hidden');
};
$('btn-close-modal').onclick = closeModal;
document.querySelector('.anim-modal-bg').onclick = closeModal;

// ============================================
//  FILE IMPORT
// ============================================
$('btn-browse-image').onclick = async () => {
    const filepath = await eel.open_file_dialog("image")();
    if (!filepath) return;
    log("Loading image...");
    const res = await eel.load_local_image(filepath)();
    if (res.success) {
        originalImageB64 = res.image;
        updateCanvas(res.image);
        log("Image loaded successfully.");
    } else {
        logError(res.error);
    }
};

$('btn-browse-video').onclick = async () => {
    const filepath = await eel.open_file_dialog("video")();
    if (!filepath) return;
    log("Extracting video frames — this may take a moment...");
    showProgress();

    const frames = parseInt($('video-frames').value) || 64;
    const cols   = parseInt($('grid-cols').value) || 8;

    const res = await eel.video_to_spritesheet(filepath, frames, cols)();
    if (res.success) {
        originalImageB64 = res.image;
        updateCanvas(res.image);
        $('grid-rows').value = Math.ceil(frames / cols);
        log("Video converted to spritesheet.");
    } else {
        logError(res.error);
    }
    hideProgress(1500);
};

// ---- Drag & Drop ----
const mainContent = document.querySelector('.main-content');
const dropZone = $('drop-zone');

mainContent.addEventListener('dragover', e => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes("Files")) {
        dropZone.classList.add('active');
    }
});
mainContent.addEventListener('dragleave', e => {
    e.preventDefault();
    dropZone.classList.remove('active');
});
mainContent.addEventListener('drop', async e => {
    e.preventDefault();
    dropZone.classList.remove('active');
    const file = e.dataTransfer.files[0];
    if (!file) return;

    log(`Dropped file: ${file.name}`);

    // Read the file as base64 and send to canvas
    const reader = new FileReader();
    reader.onload = () => {
        originalImageB64 = reader.result;
        updateCanvas(reader.result);
        log("Drag-and-drop image loaded.");
    };
    reader.readAsDataURL(file);
});

// ============================================
//  SAVE LOCAL
// ============================================
$('btn-save-local').onclick = async () => {
    if (!currentImageB64) return;
    const filepath = await eel.save_file_dialog()();
    if (!filepath) return;
    const res = await eel.save_local_image(filepath, currentImageB64)();
    if (res.success) log("Saved locally: " + filepath);
    else logError(res.error);
};

// ============================================
//  ADJUSTMENTS — SLIDERS
// ============================================
const SLIDER_KEYS = ['brightness', 'contrast', 'saturation', 'sharpness'];

function refreshSliderLabels() {
    SLIDER_KEYS.forEach(k => {
        $('val-' + k).innerText = parseFloat($('slider-' + k).value).toFixed(2);
    });
}
document.querySelectorAll('input[type="range"]').forEach(el => {
    el.addEventListener('input', refreshSliderLabels);
});

$('btn-apply-filters').onclick = async () => {
    if (!currentImageB64) return;
    log("Applying filters...");
    const adjs = {};
    SLIDER_KEYS.forEach(k => { adjs[k] = parseFloat($('slider-' + k).value); });
    const res = await eel.edit_image(currentImageB64, adjs)();
    if (res.success) {
        saveUndoState();
        updateCanvas(res.image);
        log("Filters applied.");
    } else {
        logError(res.error);
    }
};

$('btn-revert').onclick = () => {
    if (!originalImageB64) return;
    saveUndoState();
    updateCanvas(originalImageB64);
    SLIDER_KEYS.forEach(k => { $('slider-' + k).value = 1.0; });
    refreshSliderLabels();
    log("Reverted to original image.");
};

$('btn-undo').onclick = () => {
    if (imageHistory.length > 0) {
        const prev = imageHistory.pop();
        updateCanvas(prev);
        log("Undo successful.");
    } else {
        logError("Nothing to undo!");
    }
};

// ============================================
//  ADJUSTMENTS — PRESETS
// ============================================
const PRESETS = {
    reset:     { brightness: 1.0,  contrast: 1.0,  saturation: 1.0,  sharpness: 1.0  },
    vivid:     { brightness: 1.05, contrast: 1.2,  saturation: 1.6,  sharpness: 1.3  },
    cinematic: { brightness: 0.9,  contrast: 1.35, saturation: 0.8,  sharpness: 1.0  },
    sharp:     { brightness: 1.0,  contrast: 1.1,  saturation: 1.0,  sharpness: 2.5  },
    muted:     { brightness: 0.95, contrast: 0.85, saturation: 0.5,  sharpness: 0.8  },
};

document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
        const name = chip.dataset.preset;
        const p = PRESETS[name];
        if (!p || !currentImageB64) return;

        // Highlight active chip
        document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        // Set slider values
        SLIDER_KEYS.forEach(k => { $('slider-' + k).value = p[k]; });
        refreshSliderLabels();

        // Apply
        log(`Applying preset: ${name}...`);
        const source = name === 'reset' ? originalImageB64 : currentImageB64;
        const res = await eel.edit_image(source || currentImageB64, p)();
        if (res.success) {
            saveUndoState();
            updateCanvas(res.image);
            log(`Preset "${name}" applied.`);
        } else {
            logError(res.error);
        }
    });
});

// ============================================
//  BACKGROUND REMOVAL
// ============================================
// ---- Mask Refinement Slider Badges ----
$('mask-threshold').oninput = function() { $('val-mask-thresh').textContent = this.value; };
$('edge-refine').oninput = function() { $('val-edge-refine').textContent = this.value; };
$('feather-radius').oninput = function() { $('val-feather').textContent = this.value; };

function _getMaskParams() {
    return {
        threshold: parseInt($('mask-threshold').value) || 128,
        edge_strength: parseInt($('edge-refine').value) || 1,
        feather: parseInt($('feather-radius').value) || 0
    };
}

$('btn-bg-dark').onclick = async () => {
    if (!currentImageB64) return;
    log("Removing dark backgrounds...");
    globalProgressShow("Removing dark pixels...", 50);
    const res = await eel.remove_background(currentImageB64, "dark", 30, {})();
    if (res.success) { saveUndoState(); updateCanvas(res.image); log("Dark-pixel background removed."); }
    else logError(res.error);
    globalProgressDone();
};

$('btn-bg-ai').onclick = async () => {
    if (!currentImageB64) return;
    log("Running AI Background Removal (Rembg)... First run downloads the model (~170 MB).");
    globalProgressShow("AI Background Removal in progress...", 15);
    let fakePct = 15;
    const ticker = setInterval(() => {
        fakePct = Math.min(fakePct + 2, 90);
        globalProgressUpdate(fakePct, "AI Background Removal in progress...");
    }, 800);
    const params = _getMaskParams();
    const res = await eel.remove_background(currentImageB64, "rembg", 30, params)();
    clearInterval(ticker);
    if (res.success) { saveUndoState(); updateCanvas(res.image); log("AI background removal complete."); }
    else logError(res.error);
    globalProgressDone();
};

$('btn-bg-biref').onclick = async () => {
    if (!currentImageB64) return;
    log("Running Pro AI Segmentation (BiRefNet)... First run downloads the model (~350 MB).");
    globalProgressShow("Pro AI Segmentation in progress...", 5);
    let fakePct = 5;
    const ticker = setInterval(() => {
        fakePct = Math.min(fakePct + 1, 95);
        globalProgressUpdate(fakePct, "Pro AI Segmentation in progress...");
    }, 1000);

    const params = _getMaskParams();
    const res = await eel.remove_background(currentImageB64, "birefnet", 30, params)();
    clearInterval(ticker);
    if (res.success) { saveUndoState(); updateCanvas(res.image); log("Pro AI background removal complete."); }
    else logError(res.error);
    globalProgressDone();
};

// ============================================
//  UPLOAD & REMOTE FETCH
// ============================================
$('btn-upload').onclick = async () => {
    if (!currentImageB64) return alert("Import an image first.");
    const apiKey   = $('api-key').value;
    const targetId = $('target-id').value;
    if (!apiKey || !targetId) return alert("Provide both API Key and Target ID.");

    const isGroup = document.querySelector('input[name="creator_type"]:checked').value === "Group";
    const cols = parseInt($('grid-cols').value) || 1;
    const rows = parseInt($('grid-rows').value) || 1;

    showProgress();
    $('results-area').classList.add('hidden');
    log("Slicing and uploading to Roblox...");

    const res = await eel.slice_and_upload(currentImageB64, cols, rows, targetId, isGroup, apiKey)();

    if (res.success && res.ids) {
        uploadedAssetIds = res.ids;
        $('results-area').classList.remove('hidden');
        log(`Upload complete — ${res.ids.length} frames uploaded.`);
    } else {
        logError(res.error);
    }
    hideProgress(1500);
};

$('btn-fetch-remote').onclick = async () => {
    const assetId = $('remote-asset-id').value;
    const apiKey  = $('api-key').value;
    const targetId = $('target-id').value;
    if (!assetId) return alert("Enter a Roblox Asset ID to fetch.");
    if (!apiKey || !targetId) return alert("Provide both API Key and Target ID.");

    const isGroup = document.querySelector('input[name="creator_type"]:checked').value === "Group";
    const cols = parseInt($('grid-cols').value) || 1;
    const rows = parseInt($('grid-rows').value) || 1;

    showProgress();
    log(`Fetching remote asset ${assetId}...`);

    const res = await eel.fetch_and_slice(assetId, cols, rows, targetId, isGroup, apiKey)();
    if (res.success && res.ids) {
        uploadedAssetIds = res.ids;
        $('results-area').classList.remove('hidden');
        log(`Remote fetch & upload complete — ${res.ids.length} frames.`);
    } else {
        logError(res.error);
    }
    hideProgress(1500);
};

$('btn-copy').onclick = () => {
    if (uploadedAssetIds.length === 0) return;
    const text = '[\n    "' + uploadedAssetIds.join('",\n    "') + '"\n]';
    navigator.clipboard.writeText(text);
    $('btn-copy').innerHTML = SVG_COPY + " Copied!";
    setTimeout(() => { $('btn-copy').innerHTML = SVG_COPY + " Copy IDs"; }, 2000);
};

// ============================================
//  GLOBAL PROGRESS BAR
// ============================================
function globalProgressShow(label, pct) {
    const el = $('global-progress');
    el.classList.remove('hidden');
    globalProgressUpdate(pct || 0, label || 'Processing...');
}

function globalProgressUpdate(pct, label) {
    $('global-progress-fill').style.setProperty('--progress-pct', Math.max(3, pct) + '%');
    if (label) $('global-progress-label').textContent = label;
}

function globalProgressDone() {
    globalProgressUpdate(100, 'Done.');
    setTimeout(() => {
        $('global-progress').classList.add('hidden');
        globalProgressUpdate(0, '');
    }, 1200);
}

// Legacy per-tab progress (Upload tab)
function showProgress(pct) {
    $('progress-container').classList.remove('hidden');
    $('progress-fill').style.width = (pct || 0) + '%';
    globalProgressShow('Uploading...', pct);
}
function hideProgress(delay) {
    setTimeout(() => $('progress-container').classList.add('hidden'), delay || 0);
    globalProgressDone();
}

// ============================================
//  EEL CALLBACKS
// ============================================
eel.expose(update_progress);
function update_progress(current, total, msg) {
    const pct = Math.max(3, (current / total) * 100);
    // Update tab-local progress
    $('progress-fill').style.width = pct + '%';
    if (msg) $('progress-text').innerText = msg;
    // Update global bar
    globalProgressUpdate(pct, msg);
    if (msg) log(msg);
}

eel.expose(log_message);
function log_message(msg) { log(msg); }

eel.expose(log_error);
function log_error(msg) { logError(msg); }

// ============================================
//  LOGGING + GPU TOAST SYSTEM
// ============================================
const GPU_KEYWORDS = ['CUDA', 'GPU', 'DirectML', 'NVIDIA', 'TensorRT', 'Segmentation', 'AI', 'BiRefNet', 'rembg', 'Model', 'ML'];
const TOAST_ICONS = {
    gpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 6V4m4 2V4m4 2V4M8 18v2m4-2v2m4-2v2"/><circle cx="12" cy="12" r="2"/></svg>',
    ai: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3 3m0 0l-3-3m3 3V8"/></svg>'
};

function _classifyMessage(msg) {
    const m = msg.toLowerCase();
    if (m.includes('error') || m.includes('fail')) return { type: 'error', icon: TOAST_ICONS.error };
    if (m.includes('download')) return { type: 'download', icon: TOAST_ICONS.download };
    if (m.includes('cuda') || m.includes('directml') || m.includes('nvidia') || m.includes('tensorrt') || m.includes('gpu'))
        return { type: 'gpu', icon: TOAST_ICONS.gpu };
    if (m.includes('birefnet') || m.includes('rembg') || m.includes('segmentation') || m.includes('ai') || m.includes('ml') || m.includes('model'))
        return { type: 'ai', icon: TOAST_ICONS.ai };
    if (m.includes('complete') || m.includes('success') || m.includes('done') || m.includes('saved'))
        return { type: 'success', icon: TOAST_ICONS.success };
    return { type: 'info', icon: TOAST_ICONS.info };
}

let _activeToasts = [];
const MAX_TOASTS = 4;

function _spawnToast(msg, classification) {
    const container = $('toast-container');
    if (!container) return;

    // Remove oldest if over limit
    while (_activeToasts.length >= MAX_TOASTS) {
        const oldest = _activeToasts.shift();
        if (oldest && oldest.parentNode) {
            oldest.classList.add('toast-exit');
            setTimeout(() => oldest.remove(), 300);
        }
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${classification.type}`;
    toast.innerHTML = `
        <div class="toast-icon">${classification.icon}</div>
        <div class="toast-body">
            <span class="toast-msg">${msg}</span>
        </div>
    `;
    container.appendChild(toast);
    _activeToasts.push(toast);

    // Auto-dismiss
    const duration = classification.type === 'error' ? 6000 : classification.type === 'gpu' ? 4500 : 3500;
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => {
            toast.remove();
            _activeToasts = _activeToasts.filter(t => t !== toast);
        }, 400);
    }, duration);
}

function _updateGpuChip(msg) {
    const chip = $('gpu-status-chip');
    if (!chip) return;
    const m = msg.toLowerCase();
    if (m.includes('cuda')) {
        chip.className = 'gpu-chip gpu-chip-cuda';
        chip.innerHTML = TOAST_ICONS.gpu + '<span>CUDA GPU</span>';
    } else if (m.includes('directml')) {
        chip.className = 'gpu-chip gpu-chip-dml';
        chip.innerHTML = TOAST_ICONS.gpu + '<span>DirectML</span>';
    } else if (m.includes('cpu')) {
        chip.className = 'gpu-chip gpu-chip-cpu';
        chip.innerHTML = TOAST_ICONS.gpu + '<span>CPU</span>';
    }
}

function log(msg) {
    if (!msg) return;
    // Sidebar log (history)
    const el = $('global-log');
    const ts = new Date().toLocaleTimeString();
    const classification = _classifyMessage(msg);
    el.innerHTML = `<div class="log-entry log-${classification.type}"><span class="log-time">[${ts}]</span> ${msg}</div>` + el.innerHTML;
    while (el.children.length > 80) el.removeChild(el.lastChild);

    // Floating toast on canvas
    _spawnToast(msg, classification);

    // Update GPU chip if relevant
    if (GPU_KEYWORDS.some(kw => msg.toLowerCase().includes(kw.toLowerCase()))) {
        _updateGpuChip(msg);
    }
}

function logError(msg) {
    if (!msg) return;
    const el = $('global-log');
    const ts = new Date().toLocaleTimeString();
    el.innerHTML = `<div class="log-entry log-error"><span class="log-time">[${ts}]</span> ERROR: ${msg}</div>` + el.innerHTML;
    _spawnToast('ERROR: ' + msg, { type: 'error', icon: TOAST_ICONS.error });
}
