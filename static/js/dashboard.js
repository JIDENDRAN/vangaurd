/* dashboard.js — Upload + Metrics + Recent Files snapshot */

document.addEventListener('DOMContentLoaded', async () => {
    await checkUserRole();
    const files = await loadAllFiles();
    renderMetrics(files);
    renderRecentFiles(files);
    await loadPendingCount();
    setupUploadForm();
});

async function checkUserRole() {
    const resp = await fetchSecure(API.me);
    if (resp && resp.ok) {
        const user = await resp.json();
        const uploadPanel = document.getElementById('upload-panel-container');

        // Update user display in sidebar
        const userDisplay = document.getElementById('user-display-nav');
        const userAvatar = document.getElementById('user-avatar-initial');
        if (userDisplay) userDisplay.textContent = user.username || "Admin Kulkarni";
        if (userAvatar) userAvatar.textContent = (user.username || "A").charAt(0).toUpperCase();

        const isAdmin = user.role?.toLowerCase() === 'admin' || user.is_superuser;
        if (isAdmin) {
            uploadPanel?.classList.remove('hidden');
        } else {
            uploadPanel?.classList.add('hidden');
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
    const soon = files.filter(f => f.status === 'active' &&
        new Date(f.ttl_expiry) > now &&
        (new Date(f.ttl_expiry) - now) < (48 * 60 * 60 * 1000)).length; // 48h window

    animateCount('total-files', total);
    animateCount('active-files', soon);

    const statusText = document.getElementById('vault-status-text');
    if (statusText) statusText.textContent = `${total.toLocaleString()} encrypted files, sorted by TTL`;

    const healthCount = document.getElementById('health-active-count');
    if (healthCount) healthCount.textContent = total.toLocaleString();

    // Dynamic Integrity Score (Simplified)
    const integrity = total === 0 ? 100 : 100 - (files.filter(f => f.status === 'destroyed').length / total * 10);
    animateCount('integrity-score', integrity, true);

    // Update Encryption Health Circle
    const circle = document.querySelector('.circle-chart .circle');
    const circleText = document.querySelector('.circle-chart .circle-text');
    if (circle && circleText) {
        const score = Math.max(70, integrity - 5); // Mocked but dynamic
        circle.style.strokeDasharray = `${score}, 100`;
        circleText.textContent = `${Math.floor(score)}%`;
    }

    // Update vault count badge in sidebar
    const badge = document.getElementById('vault-count-badge');
    if (badge) badge.textContent = total;
}

/* ---- Header Button Hook ---- */
// Make the 'Upload File' button scroll/open the panel if on dashboard
document.querySelector('.top-nav .btn-primary')?.addEventListener('click', (e) => {
    const panel = document.getElementById('upload-panel-container');
    if (panel) {
        e.preventDefault();
        panel.classList.remove('hidden');
        panel.scrollIntoView({ behavior: 'smooth' });
        document.getElementById('file-input')?.focus();
    }
});

async function loadPendingCount() {
    const resp = await fetchSecure(API.emergency);
    if (!resp || !resp.ok) return;
    const reqs = await resp.json();
    const pending = Array.isArray(reqs) ? reqs.filter(r => r.status === 'pending').length : 0;
    animateCount('pending-requests', pending);

    const threatCount = document.getElementById('health-threat-count');
    if (threatCount) threatCount.textContent = pending.toString().padStart(2, '0');

    // Update emergency badge in sidebar
    const badge = document.getElementById('emergency-count-badge');
    if (badge) badge.textContent = pending;
}

function renderRecentFiles(files) {
    const el = document.getElementById('recent-files');
    if (!el) return;

    if (!Array.isArray(files) || files.length === 0) {
        el.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:5rem;color:var(--text-dim);font-size:0.875rem;">Vault archive is currently empty.</td></tr>';
        return;
    }

    const now = new Date();
    const recent = [...files].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);

    el.innerHTML = recent.map(f => {
        const expiry = new Date(f.ttl_expiry);
        const nowMs = now.getTime();
        const expMs = expiry.getTime();
        const diffMs = expMs - nowMs;
        const diffHours = Math.max(0, diffMs / (1000 * 60 * 60));
        const diffDays = Math.max(0, diffHours / 24);

        let ttlLabel = "";
        let progressPercent = 0;
        let progressColor = "var(--primary)";

        if (diffHours <= 0) {
            ttlLabel = "EXPIRED";
            progressPercent = 0;
            progressColor = "var(--danger)";
        } else if (diffDays >= 1) {
            ttlLabel = `${Math.floor(diffDays)}D REMAINING`;
            progressPercent = Math.min(100, (diffDays / 30) * 100);
        } else {
            ttlLabel = `${Math.floor(diffHours)}H CRITICAL`;
            progressPercent = (diffHours / 24) * 100;
            progressColor = "var(--warning)";
        }

        if (diffHours < 24 && diffHours > 0) progressColor = "var(--warning)";
        if (diffHours < 6 && diffHours > 0) progressColor = "var(--danger)";

        const ext = f.filename.split('.').pop().toUpperCase();
        const iconBg = getIconBg(ext);
        const iconColor = getIconColor(ext);

        const fmtDate = expiry.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });

        return `
            <tr style="border-bottom: 1px solid #f8fafc;">
                <td style="padding: 1.75rem 1.75rem 1.75rem 2.5rem; vertical-align: top;">
                    <div style="display: flex; gap: 1.25rem;">
                        <div style="flex-shrink: 0; width: 44px; height: 44px; background: ${iconBg}; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 800; color: ${iconColor}; border: 1px solid rgba(0,0,0,0.03);">${ext}</div>
                        <div style="overflow: hidden; flex: 1;">
                            <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 380px;" title="${escHtml(f.filename)}">${escHtml(f.filename)}</div>
                            <div style="font-size: 0.725rem; color: var(--text-dim); margin-top: 0.35rem; font-weight: 500;">
                                <span style="text-transform: uppercase; color: var(--primary); font-weight: 600;">AES-256-GCM</span> • Vault Secured Asset
                            </div>
                        </div>
                    </div>
                </td>
                <td style="padding: 1.75rem; vertical-align: top; width: 240px;">
                    <div style="display: flex; flex-direction: column; gap: 0.6rem;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.05em; color: ${progressColor}; text-transform: uppercase;">
                            <span>${ttlLabel}</span>
                            <span style="color: var(--text-dim); opacity: 0.6;">${Math.round(progressPercent)}%</span>
                        </div>
                        <div class="progress-container" style="height: 7px; background: #f1f5f9; border-radius: 4px; overflow: hidden;">
                            <div class="progress-fill" style="width: ${progressPercent}%; background: ${progressColor}; transition: width 1s ease-out; height: 100%;"></div>
                        </div>
                        <div style="font-size: 0.65rem; color: var(--text-dim); font-weight: 600; line-height: 1.4;">
                            <span style="opacity: 0.6;">RECLAMATION:</span> ${fmtDate}
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function getIconBg(ext) {
    const map = {
        'PDF': '#fff1f2',
        'SQL': '#ecfdf5',
        'BIN': '#fefce8',
        'KEY': '#fefce8',
        'ENC': '#f1f5f9',
        'JPG': '#eff6ff',
        'PNG': '#eff6ff',
        'XLSX': '#ebfef7'
    };
    return map[ext] || '#f1f5f9';
}

function getIconColor(ext) {
    const map = {
        'PDF': '#e11d48',
        'SQL': '#10b981',
        'BIN': '#ca8a04',
        'KEY': '#ca8a04',
        'ENC': '#64748b',
        'JPG': '#2563eb',
        'PNG': '#2563eb',
        'XLSX': '#10b981'
    };
    return map[ext] || '#64748b';
}

/* ---- Upload Form ---- */
function setupUploadForm() {
    const uploadForm = document.getElementById('upload-form');
    if (!uploadForm) return;

    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('file-input');
        const btn = document.getElementById('upload-btn');

        if (!fileInput.files[0]) return;

        btn.disabled = true;
        btn.innerHTML = '🛡️ Encrypting...';

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('expire_at', document.getElementById('expire-input').value);

        const resp = await fetchSecure(API.files, { method: 'POST', body: formData });

        if (resp && resp.ok) {
            btn.innerHTML = '✓ Secured Complete';
            btn.style.background = 'var(--success)';
            uploadForm.reset();
            setTimeout(async () => {
                btn.disabled = false;
                btn.innerHTML = 'Encrypt & Upload';
                btn.style.background = '';
                const files = await loadAllFiles();
                renderMetrics(files);
                renderRecentFiles(files);
            }, 3000);
        } else {
            btn.innerHTML = 'Encryption Failed';
            btn.style.background = 'var(--danger)';
            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = 'Encrypt & Upload';
                btn.style.background = '';
            }, 3000);
        }
    });
}

function animateCount(id, target, isPercent = false) {
    const el = document.getElementById(id);
    if (!el) return;
    let current = 0;
    const isFloat = id === 'integrity-score';
    const duration = 1000;
    const startTime = performance.now();

    function update(timestamp) {
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);

        current = progress * target;

        if (isPercent) {
            el.textContent = current.toFixed(isFloat ? 1 : 0) + '%';
        } else {
            el.textContent = Math.floor(current).toLocaleString();
        }

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    requestAnimationFrame(update);
}

function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
