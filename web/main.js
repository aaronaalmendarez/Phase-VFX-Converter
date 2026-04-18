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
        if (s.frame_name_prefix) $('frame-name-prefix').value = s.frame_name_prefix;
        if (s.mask_pixel_art !== undefined) $('mask-pixel-art').checked = s.mask_pixel_art;
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
            creator_type: creatorRadio ? creatorRadio.value : 'User',
            frame_name_prefix: $('frame-name-prefix').value,
            mask_pixel_art: $('mask-pixel-art').checked
        })();
    }, 500);
}

// Auto-save on input change
$('api-key').addEventListener('input', saveSettingsDebounced);
$('target-id').addEventListener('input', saveSettingsDebounced);
$('frame-name-prefix').addEventListener('input', saveSettingsDebounced);
$('mask-pixel-art').addEventListener('change', saveSettingsDebounced);
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
let _animSpriteImg = null; // Cached decoded spritesheet for anim rendering

function _getFrameGeometry() {
    const cols = parseInt($('grid-cols').value) || 1;
    const rows = parseInt($('grid-rows').value) || 1;
    const total = cols * rows;
    return { cols, rows, total };
}

function startAnim() {
    if (animTimer) clearInterval(animTimer);
    if (!currentImageB64 || !isPlaying) return;

    const { cols, rows, total } = _getFrameGeometry();
    const fps  = parseInt($('anim-fps').value) || 30;

    const img = new Image();
    img.src = currentImageB64;
    _animSpriteImg = img;

    animTimer = setInterval(() => {
        if (!img.complete || img.naturalWidth === 0) return;

        const fw = img.width / cols;
        const fh = img.height / rows;
        currentFrame = (currentFrame + 1) % total;

        const r = Math.floor(currentFrame / cols);
        const c = currentFrame % cols;

        animCanvas.width = 48;
        animCanvas.height = 48;
        animCtx.clearRect(0, 0, 48, 48);
        animCtx.drawImage(img, c * fw, r * fh, fw, fh, 0, 0, 48, 48);

        // Render to modal if active AND not in mask-editing mode
        const modal = $('anim-modal');
        if (!modal.classList.contains('hidden') && !maskEditor.active) {
            _renderModalFrame(img, fw, fh, cols);
        }
    }, 1000 / fps);
}

// Renders a single frame to the modal canvas at correct scale
function _renderModalFrame(img, fw, fh, cols) {
    const mCanvas = $('anim-modal-canvas');
    const mCtx = mCanvas.getContext('2d');
    const maxDim = 512;
    const scale = Math.min(maxDim / fw, maxDim / fh);
    const wScaled = Math.round(fw * scale);
    const hScaled = Math.round(fh * scale);

    if (mCanvas.width !== wScaled || mCanvas.height !== hScaled) {
        mCanvas.width = wScaled;
        mCanvas.height = hScaled;
        mCtx.imageSmoothingEnabled = false;
    }

    const r = Math.floor(currentFrame / cols);
    const c = currentFrame % cols;
    mCtx.clearRect(0, 0, wScaled, hScaled);
    mCtx.drawImage(img, c * fw, r * fh, fw, fh, 0, 0, wScaled, hScaled);
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
//  MASK EDITOR ENGINE
// ============================================
const maskEditor = {
    active: false,          // Is the modal in mask-edit mode?
    shape: 'ellipse',       // 'ellipse' | 'rect'
    mode: 'out',            // 'out' = erase inside, 'in' = keep inside only
    toolMode: 'draw',       // 'draw' = click empty area creates new shape, 'select' = only move/resize
    feather: 8,
    currentFrame: 0,        // Which frame we're viewing/editing in the modal
    keyframes: {},          // { [frameIndex]: { x, y, w, h } } in normalized 0-1 coords
    dragging: false,
    resizing: false,
    drawingNew: false,
    resizeHandle: null,     // 'nw','ne','sw','se'
    dragStart: { x: 0, y: 0, ox: 0, oy: 0, ow: 0, oh: 0 },
    hasShape: false,
    current: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
};

// ---- Tool Button Wiring ----
function _setShape(s) {
    maskEditor.shape = s;
    $('mask-tool-ellipse').classList.toggle('active', s === 'ellipse');
    $('mask-tool-rect').classList.toggle('active', s === 'rect');
    _renderMaskOverlay();
}
function _setMode(m) {
    maskEditor.mode = m;
    $('mask-mode-out').classList.toggle('active', m === 'out');
    $('mask-mode-in').classList.toggle('active', m === 'in');
    _renderMaskOverlay();
}
function _setToolMode(t) {
    maskEditor.toolMode = t;
    $('mask-tool-draw').classList.toggle('active', t === 'draw');
    $('mask-tool-select').classList.toggle('active', t === 'select');
    // Update cursor on overlay
    const overlay = $('mask-overlay-canvas');
    if (overlay) overlay.style.cursor = t === 'draw' ? 'crosshair' : 'default';
}

$('mask-tool-ellipse').onclick = () => _setShape('ellipse');
$('mask-tool-rect').onclick    = () => _setShape('rect');
$('mask-mode-out').onclick     = () => _setMode('out');
$('mask-mode-in').onclick      = () => _setMode('in');
$('mask-tool-draw').onclick    = () => _setToolMode('draw');
$('mask-tool-select').onclick  = () => _setToolMode('select');

$('mask-feather-kf').oninput = function() {
    maskEditor.feather = parseInt(this.value);
    $('val-mask-feather-kf').textContent = this.value;
};

// ---- Playback & Frame Navigation Controls ----
let maskPlayInterval = null;

function _maskTogglePlay() {
    const playBtn = $('mask-tl-play');
    if (maskPlayInterval) {
        clearInterval(maskPlayInterval);
        maskPlayInterval = null;
        if (playBtn) playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    } else {
        const fps = parseInt($('anim-fps').value) || 30;
        maskPlayInterval = setInterval(() => {
            let next = maskEditor.currentFrame + 1;
            if (next >= _maskTotalFrames()) next = 0;
            _maskGoToFrame(next);
        }, 1000 / Math.max(1, fps));
        if (playBtn) playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
    }
}

$('mask-tl-play').onclick = _maskTogglePlay;

$('mask-tl-prev').onclick = () => {
    let prev = maskEditor.currentFrame - 1;
    if (prev < 0) prev = _maskTotalFrames() - 1;
    _maskGoToFrame(prev);
};

$('mask-tl-next').onclick = () => {
    let next = maskEditor.currentFrame + 1;
    if (next >= _maskTotalFrames()) next = 0;
    _maskGoToFrame(next);
};

// ---- Timeline Navigation ----
function _maskTotalFrames() {
    return _getFrameGeometry().total;
}

function _maskGoToFrame(idx) {
    const total = _maskTotalFrames();
    maskEditor.currentFrame = Math.max(0, Math.min(idx, total - 1));

    // Only update current shape from keyframes if user isn't mid-draw
    if (!maskEditor.dragging && !maskEditor.resizing && !maskEditor.drawingNew) {
        const keys = Object.keys(maskEditor.keyframes).map(Number);
        if (keys.length > 0) {
            maskEditor.current = _interpolateMask(maskEditor.currentFrame);
        }
    }

    // Render the frame on the modal canvas
    _renderMaskEditFrame();
    _renderMaskOverlay();
    _updateTimelineUI();
}


// ---- Keyframe Management ----
$('btn-add-keyframe').onclick = () => {
    maskEditor.keyframes[maskEditor.currentFrame] = { ...maskEditor.current };
    _updateTimelineUI();
    log(`Mask keyframe set at frame ${maskEditor.currentFrame + 1}`);
};

$('btn-del-keyframe').onclick = () => {
    delete maskEditor.keyframes[maskEditor.currentFrame];
    _updateTimelineUI();
    log(`Mask keyframe removed at frame ${maskEditor.currentFrame + 1}`);
};

$('btn-clear-mask').onclick = () => {
    maskEditor.keyframes = {};
    maskEditor.hasShape = false;
    maskEditor.current = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
    _updateTimelineUI();
    _renderMaskOverlay();
    log('All mask keyframes cleared.');
};

// ---- Linear Interpolation Between Keyframes ----
function _interpolateMask(frameIdx) {
    const keys = Object.keys(maskEditor.keyframes).map(Number).sort((a, b) => a - b);
    if (keys.length === 0) return { ...maskEditor.current };
    if (keys.length === 1) return { ...maskEditor.keyframes[keys[0]] };

    // Exact keyframe match
    if (maskEditor.keyframes[frameIdx]) return { ...maskEditor.keyframes[frameIdx] };

    // Find surrounding keyframes
    let prevKey = null, nextKey = null;
    for (const k of keys) {
        if (k <= frameIdx) prevKey = k;
        if (k >= frameIdx && nextKey === null) nextKey = k;
    }

    // Clamp to edges
    if (prevKey === null) return { ...maskEditor.keyframes[nextKey] };
    if (nextKey === null) return { ...maskEditor.keyframes[prevKey] };
    if (prevKey === nextKey) return { ...maskEditor.keyframes[prevKey] };

    // Lerp
    const t = (frameIdx - prevKey) / (nextKey - prevKey);
    const a = maskEditor.keyframes[prevKey];
    const b = maskEditor.keyframes[nextKey];
    return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        w: a.w + (b.w - a.w) * t,
        h: a.h + (b.h - a.h) * t,
    };
}

// ---- Render Functions ----
function _renderMaskEditFrame() {
    if (!_animSpriteImg || !_animSpriteImg.complete) return;
    const { cols, rows } = _getFrameGeometry();
    const img = _animSpriteImg;
    const fw = img.width / cols;
    const fh = img.height / rows;
    _renderModalFrame(img, fw, fh, cols);
}

function _renderMaskOverlay() {
    const mCanvas = $('anim-modal-canvas');
    const overlay = $('mask-overlay-canvas');
    if (!mCanvas || !overlay) return;

    // Match the overlay's PIXEL dimensions to the canvas element's actual pixel dimensions
    // so the drawn shapes are in the right place.
    const displayW = mCanvas.offsetWidth;
    const displayH = mCanvas.offsetHeight;

    // Position overlay exactly on top via CSS — the canvas pixel buffer drives coordinate math
    overlay.width = mCanvas.width;
    overlay.height = mCanvas.height;
    overlay.style.width  = displayW + 'px';
    overlay.style.height = displayH + 'px';

    const octx = overlay.getContext('2d');
    const w = overlay.width;
    const h = overlay.height;
    octx.clearRect(0, 0, w, h);

    // Don't draw anything until the user has actually placed a shape
    if (!maskEditor.hasShape && !maskEditor.drawingNew) return;
    // Also skip if the shape is degenerate (zero size)
    if (maskEditor.current.w < 0.005 || maskEditor.current.h < 0.005) return;

    const m = maskEditor.current;
    const px = m.x * w, py = m.y * h, pw = m.w * w, ph = m.h * h;

    // ---- Draw mask zone ----
    if (maskEditor.mode === 'out') {
        octx.fillStyle = 'rgba(255, 60, 60, 0.22)';
        octx.strokeStyle = 'rgba(255, 80, 80, 0.9)';
        if (maskEditor.shape === 'ellipse') {
            octx.beginPath();
            octx.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, 0, 0, Math.PI * 2);
            octx.fill();
        } else {
            octx.fillRect(px, py, pw, ph);
        }
    } else {
        // Dim everything outside the mask shape
        octx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        octx.fillRect(0, 0, w, h);
        octx.globalCompositeOperation = 'destination-out';
        octx.fillStyle = 'rgba(0,0,0,1)';
        if (maskEditor.shape === 'ellipse') {
            octx.beginPath();
            octx.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, 0, 0, Math.PI * 2);
            octx.fill();
        } else {
            octx.fillRect(px, py, pw, ph);
        }
        octx.globalCompositeOperation = 'source-over';
        octx.strokeStyle = 'rgba(52, 211, 153, 0.9)';
    }

    // ---- Draw border ----
    octx.lineWidth = 1.5;
    octx.setLineDash([5, 4]);
    if (maskEditor.shape === 'ellipse') {
        octx.beginPath();
        octx.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, 0, 0, Math.PI * 2);
        octx.stroke();
    } else {
        octx.strokeRect(px, py, pw, ph);
    }
    octx.setLineDash([]);

    // ---- Draw 4 corner resize handles ----
    const hs = 8;
    octx.lineWidth = 1.5;
    octx.strokeStyle = '#fff';
    const handleCorners = [
        [px, py], [px + pw, py],
        [px, py + ph], [px + pw, py + ph]
    ];
    for (const [cx, cy] of handleCorners) {
        octx.fillStyle = 'rgba(20,20,20,0.7)';
        octx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs);
        octx.strokeRect(cx - hs / 2, cy - hs / 2, hs, hs);
    }
}

// ---- Timeline UI & Drag-Scrub ----
function _buildTimeline() {
    const track = $('mask-timeline-track');
    if (!track) return;
    track.innerHTML = '';
    const total = _maskTotalFrames();
    for (let i = 0; i < total; i++) {
        const cell = document.createElement('div');
        cell.className = 'mask-tl-cell';
        cell.dataset.frame = i;
        cell.style.flex = `1 0 ${Math.max(4, Math.min(12, 600 / total))}px`;
        track.appendChild(cell);
    }
    _updateTimelineUI();

    // ---- Drag-scrub & Keyframe Moving ----
    let tlScrubbing = false;
    let draggingKeyframe = null; // { fromFrame: int, data: object }

    function _getFrameFromEvent(e) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        if (el && el.classList.contains('mask-tl-cell')) {
            return parseInt(el.dataset.frame);
        }
        return null;
    }

    track.addEventListener('mousedown', (e) => {
        const f = _getFrameFromEvent(e);
        if (f !== null) {
            if (maskEditor.keyframes[f] !== undefined) {
                // User clicked ON a keyframe, prepare to drag it
                draggingKeyframe = { fromFrame: f, data: maskEditor.keyframes[f] };
            } else {
                tlScrubbing = true;
            }
            _maskGoToFrame(f);
        }
        e.preventDefault(); // prevent text selection during scrub
    });

    document.addEventListener('mousemove', (e) => {
        const f = _getFrameFromEvent(e);
        if (f !== null) {
            if (draggingKeyframe) {
                if (f !== draggingKeyframe.fromFrame) {
                    // Move the keyframe to the new cell
                    delete maskEditor.keyframes[draggingKeyframe.fromFrame];
                    maskEditor.keyframes[f] = draggingKeyframe.data;
                    draggingKeyframe.fromFrame = f; // Update source so we can keep dragging
                    _maskGoToFrame(f);
                }
            } else if (tlScrubbing) {
                if (f !== maskEditor.currentFrame) {
                    _maskGoToFrame(f);
                }
            }
        }
    });

    document.addEventListener('mouseup', () => {
        tlScrubbing = false;
        if (draggingKeyframe) {
            _updateTimelineUI(); // Ensure UI reflects final pos
            draggingKeyframe = null;
        }
    });
}

function _updateTimelineUI() {
    const total = _maskTotalFrames();
    $('mask-tl-frame-label').textContent = `Frame ${maskEditor.currentFrame + 1} / ${total}`;

    const cells = $('mask-timeline-track').querySelectorAll('.mask-tl-cell');
    cells.forEach((cell, i) => {
        cell.classList.toggle('active', i === maskEditor.currentFrame);
        cell.classList.toggle('has-keyframe', maskEditor.keyframes[i] !== undefined);
    });
}

// ---- Mouse Interaction on Overlay Canvas ----
const _overlayEl = () => $('mask-overlay-canvas');

// Returns mouse position normalized to 0..1 relative to the DISPLAYED size of the overlay
function _getOverlayMousePos(e) {
    const ovEl = _overlayEl();
    const rect = ovEl.getBoundingClientRect();
    return {
        // Clamp to [0,1] so dragging outside the canvas doesn't blow up coordinates
        x: Math.max(0, Math.min(1, (e.clientX - rect.left)  / rect.width)),
        y: Math.max(0, Math.min(1, (e.clientY - rect.top)   / rect.height))
    };
}

function _hitTestHandle(mx, my) {
    const rect = _overlayEl().getBoundingClientRect();
    const pxX = mx * rect.width;
    const pxY = my * rect.height;

    const m = maskEditor.current;
    const corners = {
        'nw': [m.x * rect.width, m.y * rect.height],
        'ne': [(m.x + m.w) * rect.width, m.y * rect.height],
        'sw': [m.x * rect.width, (m.y + m.h) * rect.height],
        'se': [(m.x + m.w) * rect.width, (m.y + m.h) * rect.height],
    };

    for (const [handle, [cx, cy]] of Object.entries(corners)) {
        if (Math.hypot(pxX - cx, pxY - cy) < 15) { // 15px radius hit area
            return handle;
        }
    }
    return null;
}

function _hitTestBody(mx, my) {
    const m = maskEditor.current;
    return mx >= m.x && mx <= m.x + m.w && my >= m.y && my <= m.y + m.h;
}

// Event delegation on the overlay canvas
document.addEventListener('mousedown', (e) => {
    if (!maskEditor.active) return;
    if (e.target !== _overlayEl()) return;

    const pos = _getOverlayMousePos(e);
    const handle = _hitTestHandle(pos.x, pos.y);

    if (handle) {
        maskEditor.resizing = true;
        maskEditor.resizeHandle = handle;
        maskEditor.dragStart = { x: pos.x, y: pos.y, ox: maskEditor.current.x, oy: maskEditor.current.y, ow: maskEditor.current.w, oh: maskEditor.current.h };
    } else if (maskEditor.hasShape && _hitTestBody(pos.x, pos.y)) {
        // Move the existing shape
        maskEditor.dragging = true;
        maskEditor.dragStart = { x: pos.x, y: pos.y, ox: maskEditor.current.x, oy: maskEditor.current.y, ow: maskEditor.current.w, oh: maskEditor.current.h };
    } else if (maskEditor.toolMode === 'draw') {
        // Only create a new shape in Draw mode
        maskEditor.drawingNew = true;
        maskEditor.hasShape = true;
        maskEditor.current.x = pos.x;
        maskEditor.current.y = pos.y;
        maskEditor.current.w = 0;
        maskEditor.current.h = 0;
        maskEditor.dragStart = { x: pos.x, y: pos.y };
    }
    // In Select mode with a miss: do nothing (no accidental new shapes)
    _renderMaskOverlay();
});

document.addEventListener('mousemove', (e) => {
    if (!maskEditor.active) return;
    if (!maskEditor.dragging && !maskEditor.resizing && !maskEditor.drawingNew) return;

    const pos = _getOverlayMousePos(e);
    const s = maskEditor.dragStart;

    if (maskEditor.drawingNew) {
        // Math allows dragging backwards (up/left) natively
        maskEditor.current.x = Math.min(s.x, pos.x);
        maskEditor.current.y = Math.min(s.y, pos.y);
        maskEditor.current.w = Math.max(0.01, Math.abs(pos.x - s.x));
        maskEditor.current.h = Math.max(0.01, Math.abs(pos.y - s.y));
    } else if (maskEditor.dragging) {
        const dx = pos.x - s.x;
        const dy = pos.y - s.y;
        maskEditor.current.x = s.ox + dx;
        maskEditor.current.y = s.oy + dy;
    } else if (maskEditor.resizing) {
        const dx = pos.x - s.x;
        const dy = pos.y - s.y;
        const h = maskEditor.resizeHandle;
        if (h === 'se') {
            maskEditor.current.w = Math.max(0.02, s.ow + dx);
            maskEditor.current.h = Math.max(0.02, s.oh + dy);
        } else if (h === 'sw') {
            const shiftX = Math.min(dx, s.ow - 0.02);
            maskEditor.current.x = s.ox + shiftX;
            maskEditor.current.w = s.ow - shiftX;
            maskEditor.current.h = Math.max(0.02, s.oh + dy);
        } else if (h === 'ne') {
            const shiftY = Math.min(dy, s.oh - 0.02);
            maskEditor.current.y = s.oy + shiftY;
            maskEditor.current.w = Math.max(0.02, s.ow + dx);
            maskEditor.current.h = s.oh - shiftY;
        } else if (h === 'nw') {
            const shiftX = Math.min(dx, s.ow - 0.02);
            const shiftY = Math.min(dy, s.oh - 0.02);
            maskEditor.current.x = s.ox + shiftX;
            maskEditor.current.y = s.oy + shiftY;
            maskEditor.current.w = s.ow - shiftX;
            maskEditor.current.h = s.oh - shiftY;
        }
    }
    _renderMaskOverlay();
});

document.addEventListener('mouseup', () => {
    if (maskEditor.dragging || maskEditor.resizing || maskEditor.drawingNew) {
        maskEditor.dragging = false;
        maskEditor.resizing = false;
        maskEditor.drawingNew = false;
        
        // Auto-keyframe: update existing frame silently
        if (maskEditor.keyframes[maskEditor.currentFrame]) {
            maskEditor.keyframes[maskEditor.currentFrame] = { ...maskEditor.current };
        }
        _renderMaskOverlay();
    }
});

// ---- Modal Open/Close ----
$('btn-enlarge-anim').onclick = () => {
    if (!currentImageB64) return;
    $('anim-modal').classList.remove('hidden');

    // Cache the sprite image
    const img = new Image();
    img.src = currentImageB64;
    img.onload = () => {
        _animSpriteImg = img;
        maskEditor.active = true;
        maskEditor.currentFrame = 0;
        _buildTimeline();
        _maskGoToFrame(0);
    };
};

const closeModal = () => {
    $('anim-modal').classList.add('hidden');
    maskEditor.active = false;
};
$('btn-close-modal').onclick = closeModal;
document.querySelector('.anim-modal-bg').onclick = closeModal;

// ---- Apply Mask to Spritesheet (sends to Python backend) ----
$('btn-apply-mask').onclick = async () => {
    if (!currentImageB64) return;
    const keys = Object.keys(maskEditor.keyframes);
    if (keys.length === 0) {
        log('No keyframes set. Draw a mask shape and click "Set Key" first.');
        return;
    }

    const { cols, rows, total } = _getFrameGeometry();

    // Generate interpolated mask data for every frame
    const maskData = [];
    for (let i = 0; i < total; i++) {
        const m = _interpolateMask(i);
        maskData.push({
            x: m.x, y: m.y, w: m.w, h: m.h,
            shape: maskEditor.shape,
            mode: maskEditor.mode,
            feather: maskEditor.feather
        });
    }

    log('Applying mask keyframes to spritesheet...');
    globalProgressShow('Baking masks...', 50);

    const res = await eel.apply_keyframed_masks(currentImageB64, cols, rows, maskData)();
    if (res.success) {
        saveUndoState();
        updateCanvas(res.image);
        // Reload the sprite image in the editor
        const img = new Image();
        img.src = res.image;
        img.onload = () => {
            _animSpriteImg = img;
            _renderMaskEditFrame();
            _renderMaskOverlay();
        };
        log('Mask applied successfully to all frames!');
    } else {
        logError(res.error);
    }
    globalProgressDone();
};

// ============================================
//  FILE IMPORT
// ============================================
$('btn-browse-image').onclick = async () => {
    const filepath = await eel.open_file_dialog("image")();
    if (!filepath) return;

    // Auto-route GIFs to video extractor
    if (filepath.toLowerCase().endsWith('.gif') || filepath.toLowerCase().endsWith('.mp4')) {
        log("Animated format detected, extracting frames to spritesheet...");
        showProgress();
        const frames = parseInt($('video-frames').value) || 64;
        const cols   = parseInt($('grid-cols').value) || 8;
        const res = await eel.video_to_spritesheet(filepath, frames, cols)();
        if (res.success) {
            originalImageB64 = res.image;
            updateCanvas(res.image);
            $('grid-rows').value = Math.ceil(frames / cols);
            log("Animated file converted to spritesheet.");
        } else {
            logError(res.error);
        }
        hideProgress(1500);
        return;
    }

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

    const isAnim = file.name.toLowerCase().endsWith('.gif') || file.type.startsWith('video/');

    if (isAnim) {
        log("Animated file dropped. Processing into spritesheet...");
        showProgress();
        const reader = new FileReader();
        reader.onload = async () => {
            const frames = parseInt($('video-frames').value) || 64;
            const cols   = parseInt($('grid-cols').value) || 8;
            const res = await eel.video_b64_to_spritesheet(reader.result, frames, cols, file.name)();
            if (res.success) {
                originalImageB64 = res.image;
                updateCanvas(res.image);
                $('grid-rows').value = Math.ceil(frames / cols);
                log("Dropped animation converted to spritesheet.");
            } else {
                logError(res.error);
            }
            hideProgress(1500);
        };
        reader.readAsDataURL(file);
        return;
    }

    // Read the file as base64 and send to canvas (static images)
    const reader = new FileReader();
    reader.onload = () => {
        originalImageB64 = reader.result;
        updateCanvas(reader.result);
        log("Drag-and-drop static image loaded.");
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
        feather: parseInt($('feather-radius').value) || 0,
        pixel_art: $('mask-pixel-art').checked
    };
}
$('luma-threshold').oninput = function() { $('val-luma-thresh').textContent = this.value; };

$('btn-reset-mask').onclick = () => {
    $('mask-threshold').value = 128; $('val-mask-thresh').textContent = '128';
    $('edge-refine').value = 1; $('val-edge-refine').textContent = '1';
    $('feather-radius').value = 0; $('val-feather').textContent = '0';
    $('mask-pixel-art').checked = false;
};

$('btn-reset-vfx').onclick = () => {
    $('luma-threshold').value = 35; $('val-luma-thresh').textContent = '35';
};
$('btn-bg-dark').onclick = async () => {
    if (!currentImageB64) return;
    log("Applying VFX Unmultiply (Luma Key)...");
    globalProgressShow("Extracting glows...", 50);
    const thresh = parseInt($('luma-threshold').value) || 15;
    const res = await eel.remove_background(currentImageB64, "dark", thresh, {})();
    if (res.success) { saveUndoState(); updateCanvas(res.image); log("Unmultiply (Luma Key) applied successfully."); }
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
// ---- Frame Name Preview ----
function updateNamePreview() {
    const prefix = $('frame-name-prefix').value || 'Phase_VFX_Frame';
    const cols = parseInt($('grid-cols').value) || 1;
    const rows = parseInt($('grid-rows').value) || 1;
    const total = cols * rows;
    let preview = '';
    const show = Math.min(total, 3);
    for (let i = 1; i <= show; i++) preview += `${prefix}_${i}, `;
    if (total > 3) preview += '...';
    else preview = preview.slice(0, -2);
    $('name-preview-text').textContent = preview;
}
$('frame-name-prefix').addEventListener('input', updateNamePreview);
$('grid-cols').addEventListener('change', updateNamePreview);
$('grid-rows').addEventListener('change', updateNamePreview);
updateNamePreview();

async function _handleUpload(mode) {
    if (!currentImageB64) return alert("Import an image first.");
    const apiKey   = $('api-key').value;
    const targetId = $('target-id').value;
    if (!apiKey || !targetId) return alert("Provide both API Key and Target ID.");

    // Warning check if uploading full sheet > 8000
    if (mode === 'sheet') {
        const cv = $('preview-canvas');
        if (cv.width > 8000 || cv.height > 8000) {
            const proceed = confirm(`Warning: The spritesheet is ${cv.width}x${cv.height}.\n\nRoblox requires Decals to be under 8000x8000 and downscales anything over 1024x1024.\n\nProceed anyway?`);
            if (!proceed) return;
        }
    }

    const isGroup = document.querySelector('input[name="creator_type"]:checked').value === "Group";
    const cols = parseInt($('grid-cols').value) || 1;
    const rows = parseInt($('grid-rows').value) || 1;
    const namePrefix = $('frame-name-prefix').value || 'Phase_VFX_Frame';

    showProgress();
    $('results-area').classList.add('hidden');
    log(mode === 'sheet' 
        ? `Uploading full spritesheet to Roblox as "${namePrefix}"...` 
        : `Slicing and uploading to Roblox as "${namePrefix}_1, ${namePrefix}_2, ..."...`);

    const res = await eel.slice_and_upload(currentImageB64, cols, rows, targetId, isGroup, apiKey, namePrefix, mode)();

    if (res.success && res.ids) {
        uploadedAssetIds = res.ids;
        $('results-area').classList.remove('hidden');
        log(`Upload complete — ${res.ids.length} uploaded.`);
    } else {
        logError(res.error);
    }
    hideProgress(1500);
}

$('btn-upload-sheet').onclick = () => _handleUpload('sheet');
$('btn-upload-slice').onclick = () => _handleUpload('slice');

$('btn-fetch-remote').onclick = async () => {
    const assetId = $('remote-asset-id').value;
    const apiKey  = $('api-key').value;
    const targetId = $('target-id').value;
    if (!assetId) return alert("Enter a Roblox Asset ID to fetch.");
    if (!apiKey || !targetId) return alert("Provide both API Key and Target ID.");

    const isGroup = document.querySelector('input[name="creator_type"]:checked').value === "Group";
    const cols = parseInt($('grid-cols').value) || 1;
    const rows = parseInt($('grid-rows').value) || 1;
    const namePrefix = $('frame-name-prefix').value || 'Phase_VFX_Frame';

    showProgress();
    log(`Fetching remote asset ${assetId}...`);

    const res = await eel.fetch_and_slice(assetId, cols, rows, targetId, isGroup, apiKey, namePrefix)();
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
