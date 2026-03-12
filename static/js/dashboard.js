/* dashboard.js — Upload + Metrics + Recent Files snapshot */

document.addEventListener('DOMContentLoaded', async () => {
    await checkUserRole();
    const files = await loadAllFiles();
    renderMetrics(files);
    renderRecentFiles(files);
    await loadPendingCount();
    setupUploadForm();
    setupDropZone();
});

async function checkUserRole() {
    const resp = await fetchSecure(API.me);
    if (resp && resp.ok) {
        const user = await resp.json();
        const uploadPanel = document.getElementById('upload-panel-container');
        const restrictedPanel = document.getElementById('upload-restricted-container');

        if (user.role?.toLowerCase() === 'admin' || user.is_superuser) {
            uploadPanel?.classList.remove('hidden');
            restrictedPanel?.classList.add('hidden');
        } else {
            uploadPanel?.classList.add('hidden');
            restrictedPanel?.classList.remove('hidden');
        }
    }
}

async function loadAllFiles() {
    const resp = await fetchSecure(API.files);
    if (!resp || !resp.ok) return [];
    return resp.json();
}

function renderMetrics(files) {
    if (!Array.isArray(files)) return;
    const now = new Date();
    const total = files.length;
    const active = files.filter(f => f.status === 'active' && new Date(f.ttl_expiry) > now).length;
    const expired = files.filter(f => f.status === 'expired' || f.status === 'destroyed' || new Date(f.ttl_expiry) <= now).length;

    animateCount('total-files', total);
    animateCount('active-files', active);
    animateCount('expired-files', expired);
}

async function loadPendingCount() {
    const resp = await fetchSecure(API.emergency);
    if (!resp || !resp.ok) {
        const el = document.getElementById('pending-requests');
        if (el) el.textContent = 'N/A';
        return;
    }
    const reqs = await resp.json();
    const pending = Array.isArray(reqs) ? reqs.filter(r => r.status === 'pending').length : 0;
    animateCount('pending-requests', pending);
}

function renderRecentFiles(files) {
    const el = document.getElementById('recent-files');
    if (!el) return;

    if (!Array.isArray(files) || files.length === 0) {
        el.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:1rem;">[ VAULT EMPTY ]</p>';
        return;
    }

    const now = new Date();
    const recent = [...files].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
    el.innerHTML = recent.map(f => {
        const isExpired = new Date(f.ttl_expiry) <= now;
        const displayStatus = (f.status === 'active' && isExpired) ? 'expired' : f.status;

        return `
        <div class="file-card" style="border-left-color:${statusColor(displayStatus)};">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong style="color:var(--primary-cyan);font-size:0.85rem;">${escHtml(f.filename)}</strong>
                <span class="status-badge status-${displayStatus}">${displayStatus.toUpperCase()}</span>
            </div>
            <div style="font-size:0.7rem;color:var(--text-dim);margin-top:.4rem;">
                Expires: ${new Date(f.ttl_expiry).toLocaleString()}
            </div>
        </div>
    `}).join('');
}

/* ---- Upload Form ---- */
function setupUploadForm() {
    const uploadForm = document.getElementById('upload-form');
    if (!uploadForm) return;

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('file-input');
        const ttlInput = document.getElementById('ttl-input');
        const limitInput = document.getElementById('limit-input');
        const statusEl = document.getElementById('upload-status');
        const btn = document.getElementById('upload-btn');
        const progressBar = document.getElementById('upload-progress-bar');
        const progressFill = document.getElementById('upload-progress-fill');

        if (!fileInput.files[0]) return;

        btn.disabled = true;
        btn.innerText = 'ENCRYPTING...';
        statusEl.style.color = 'var(--primary-lime)';
        statusEl.innerText = 'ENCRYPTING PAYLOAD...';
        progressBar.classList.remove('hidden');
        progressFill.style.width = '30%';

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('expire_at', document.getElementById('expire-input').value);

        progressFill.style.width = '60%';

        const resp = await fetchSecure(API.files, { method: 'POST', body: formData });

        progressFill.style.width = '100%';

        if (resp && resp.ok) {
            statusEl.innerText = '✓ UPLOAD COMPLETE. KEY SECURED IN VAULT.';
            statusEl.style.color = 'var(--primary-lime)';
            uploadForm.reset();
            document.getElementById('drop-label').classList.remove('hidden');
            document.getElementById('selected-file-name').classList.add('hidden');
            setTimeout(async () => {
                statusEl.innerText = '';
                progressBar.classList.add('hidden');
                progressFill.style.width = '0%';
                btn.disabled = false;
                btn.innerText = 'ENCRYPT & UPLOAD';
                const files = await loadAllFiles();
                renderMetrics(files);
                renderRecentFiles(files);
            }, 2500);
        } else {
            statusEl.innerText = '✗ UPLOAD FAILED: ENCRYPTION ERROR';
            statusEl.style.color = 'var(--danger)';
            progressBar.classList.add('hidden');
            btn.disabled = false;
            btn.innerText = 'ENCRYPT & UPLOAD';
        }
    });
}

/* ---- Drop Zone ---- */
function setupDropZone() {
    const zone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    if (!zone || !fileInput) return;

    fileInput.addEventListener('change', () => {
        showSelectedFile(fileInput.files[0]);
    });

    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) {
            fileInput.files = e.dataTransfer.files;
            showSelectedFile(e.dataTransfer.files[0]);
        }
    });
}

function showSelectedFile(file) {
    if (!file) return;
    const label = document.getElementById('drop-label');
    const nameEl = document.getElementById('selected-file-name');
    label.classList.add('hidden');
    nameEl.classList.remove('hidden');
    nameEl.innerHTML = `<span style="font-size:1.5rem;display:block;margin-bottom:.5rem;">⬡</span>${escHtml(file.name)}<br><span style="color:var(--text-dim);font-size:0.7rem;">${(file.size / 1024).toFixed(1)} KB</span>`;
}

/* ---- Helpers ---- */
function animateCount(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    let current = 0;
    const step = Math.max(1, Math.floor(target / 20));
    const timer = setInterval(() => {
        current = Math.min(current + step, target);
        el.textContent = current;
        if (current >= target) clearInterval(timer);
    }, 40);
}

function statusColor(status) {
    return status === 'active' ? 'var(--primary-lime)' :
        status === 'expired' ? 'var(--danger)' : 'var(--text-dim)';
}

function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
