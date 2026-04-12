/* ========================================================
   Phase VFX Converter — Application Logic
   ======================================================== */

// ── State ──
let currentBase64 = null;
let currentStep = 0;
let isProcessing = false;

// ── Onboarding ──
function nextStep() {
    const steps = document.querySelectorAll('.onboarding-card .step');
    const dots  = document.querySelectorAll('.dot');
    steps[currentStep].classList.remove('active');
    dots[currentStep].classList.remove('active');
    currentStep++;
    steps[currentStep].classList.add('active');
    dots[currentStep].classList.add('active');
}

function prevStep() {
    const steps = document.querySelectorAll('.onboarding-card .step');
    const dots  = document.querySelectorAll('.dot');
    steps[currentStep].classList.remove('active');
    dots[currentStep].classList.remove('active');
    currentStep--;
    steps[currentStep].classList.add('active');
    dots[currentStep].classList.add('active');
}

function finishOnboarding() {
    const key = document.getElementById('onboardingKey').value.trim();
    if (!key) {
        showToast('Please paste your API key first', 'error');
        return;
    }
    // Transfer key to main sidebar
    document.getElementById('apiKey').value = key;

    const overlay = document.getElementById('onboarding');
    overlay.classList.add('closing');
    setTimeout(() => { overlay.style.display = 'none'; }, 500);
}

function showOnboarding() {
    const overlay = document.getElementById('onboarding');
    overlay.style.display = 'flex';
    overlay.classList.remove('closing');
    // Reset to step 0
    currentStep = 0;
    document.querySelectorAll('.onboarding-card .step').forEach((s, i) => s.classList.toggle('active', i === 0));
    document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === 0));
}

function openExternal(url) {
    // In Eel context, try to open in system browser
    try { window.open(url); } catch(e) {}
}

// ── Toggle Key Visibility ──
function toggleKeyVis(btn) {
    const input = btn.closest('.onboarding-input-wrap, .input-with-icon').querySelector('input');
    input.type = input.type === 'password' ? 'text' : 'password';
}

// ── Grid Updates ──
const gridCols  = document.getElementById('gridCols');
const gridRows  = document.getElementById('gridRows');
const gridTotal = document.getElementById('gridTotal');

function updateGridTotal() {
    const c = parseInt(gridCols.value) || 0;
    const r = parseInt(gridRows.value) || 0;
    gridTotal.textContent = `= ${c * r} frames`;
}
gridCols.addEventListener('input', updateGridTotal);
gridRows.addEventListener('input', updateGridTotal);

// ── Drag & Drop ──
const dropzone       = document.getElementById('dropzone');
const dropContent    = document.getElementById('dropContent');
const imagePreview   = document.getElementById('imagePreview');
const uploadBtn      = document.getElementById('uploadBtn');

dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!isProcessing) dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (isProcessing) return;
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        handleFile(file);
    } else {
        showToast('Please drop a valid image file (PNG/JPG)', 'error');
    }
});
dropzone.addEventListener('click', () => {
    if (isProcessing) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png, image/jpeg';
    input.onchange = (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); };
    input.click();
});

function handleFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        currentBase64 = e.target.result;
        imagePreview.src = currentBase64;
        imagePreview.classList.add('visible');
        dropContent.style.display = 'none';
        dropzone.classList.add('has-image');
        uploadBtn.classList.add('visible');
        showToast('Spritesheet loaded!', 'success');
    };
    reader.readAsDataURL(file);
}

// ── State Transitions ──
function showState(stateId) {
    document.querySelectorAll('.state-view').forEach(v => v.classList.remove('active'));
    document.getElementById(stateId).classList.add('active');
}

function resetToIdle() {
    currentBase64 = null;
    imagePreview.src = '';
    imagePreview.classList.remove('visible');
    dropContent.style.display = '';
    dropzone.classList.remove('has-image');
    uploadBtn.classList.remove('visible');
    showState('stateIdle');
}

// ── Upload Flow ──
async function startUpload() {
    const apiKey    = document.getElementById('apiKey').value.trim();
    const creatorId = document.getElementById('creatorId').value.trim();
    const cols      = parseInt(gridCols.value);
    const rows      = parseInt(gridRows.value);
    const isGroup   = document.getElementById('radioGroup').checked;

    // Validate
    if (!apiKey)       { showToast('Enter your Open Cloud API Key in the sidebar', 'error'); return; }
    if (!creatorId)    { showToast('Enter your Creator ID in the sidebar', 'error'); return; }
    if (!currentBase64){ showToast('Drop an image first', 'error'); return; }
    if (isNaN(cols) || isNaN(rows) || cols < 1 || rows < 1) {
        showToast('Invalid grid dimensions', 'error');
        return;
    }

    isProcessing = true;
    showState('stateUploading');

    document.getElementById('spinnerPercent').textContent = '0%';
    document.getElementById('uploadStatusTitle').textContent = 'Slicing frames...';
    document.getElementById('uploadDetail').textContent = 'Preparing your spritesheet';
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('frameCounter').textContent = `0 / ${cols * rows}`;

    try {
        const result = await eel.slice_and_upload(
            currentBase64, cols, rows, creatorId, isGroup, apiKey
        )();

        isProcessing = false;

        if (result && result.success) {
            showState('stateComplete');
            const luaTable = "{\n    " + result.ids.join(",\n    ") + "\n}";
            document.getElementById('resultOutput').value = luaTable;
            showToast(`Successfully uploaded ${result.ids.length} frames!`, 'success');
        } else {
            showState('stateIdle');
            showToast(result?.error || 'Upload failed', 'error');
        }
    } catch(err) {
        isProcessing = false;
        showState('stateIdle');
        showToast('Connection error: ' + err.message, 'error');
    }
}

async function startCloudUpload() {
    const apiKey    = document.getElementById('apiKey').value.trim();
    const creatorId = document.getElementById('creatorId').value.trim();
    const cols      = parseInt(gridCols.value);
    const rows      = parseInt(gridRows.value);
    const isGroup   = document.getElementById('radioGroup').checked;
    const assetId   = document.getElementById('cloudAssetId').value.trim();

    // Validate
    if (!apiKey)       { showToast('Enter your Open Cloud API Key in the sidebar', 'error'); return; }
    if (!creatorId)    { showToast('Enter your Creator ID in the sidebar', 'error'); return; }
    if (!assetId)      { showToast('Enter a valid Roblox Asset ID', 'error'); return; }
    if (isNaN(cols) || isNaN(rows) || cols < 1 || rows < 1) {
        showToast('Invalid grid dimensions', 'error');
        return;
    }

    isProcessing = true;
    showState('stateUploading');

    document.getElementById('spinnerPercent').textContent = '0%';
    document.getElementById('uploadStatusTitle').textContent = 'Fetching Asset...';
    document.getElementById('uploadDetail').textContent = 'Downloading image from Roblox servers';
    document.getElementById('progressFill').style.width = '0%';
    document.getElementById('frameCounter').textContent = `0 / ${cols * rows}`;

    try {
        const result = await eel.fetch_and_slice(
            assetId, cols, rows, creatorId, isGroup, apiKey
        )();

        isProcessing = false;

        if (result && result.success) {
            showState('stateComplete');
            const luaTable = "{\n    " + result.ids.join(",\n    ") + "\n}";
            document.getElementById('resultOutput').value = luaTable;
            showToast(`Successfully sliced and uploaded ${result.ids.length} frames!`, 'success');
        } else {
            showState('stateIdle');
            showToast(result?.error || 'Upload failed', 'error');
        }
    } catch(err) {
        isProcessing = false;
        showState('stateIdle');
        showToast('Connection error: ' + err.message, 'error');
    }
}

// ── Copy Results ──
function copyResults() {
    const textarea = document.getElementById('resultOutput');
    textarea.select();
    document.execCommand('copy');
    showToast('Copied to clipboard!', 'success');
}

// ── Toast System ──
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-dot"></span>${message}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ── Eel Callbacks (called from Python) ──
eel.expose(update_progress);
function update_progress(current, total, message) {
    const pct = Math.round((current / total) * 100);
    document.getElementById('spinnerPercent').textContent = pct + '%';
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('uploadStatusTitle').textContent = `Uploading frame ${current}/${total}`;
    document.getElementById('uploadDetail').textContent = message;
    document.getElementById('frameCounter').textContent = `${current} / ${total}`;
}

eel.expose(log_message);
function log_message(msg) {
    console.log('[Phase]', msg);
}

eel.expose(log_error);
function log_error(err) {
    console.error('[Phase Error]', err);
    showToast(err, 'error');
}
