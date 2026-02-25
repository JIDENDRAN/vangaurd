const API = {
    login: '/api/auth/login/',
    files: '/api/files/',
    audit: '/api/audit/',
    emergency: '/api/emergency/'
};

let tokens = {
    access: localStorage.getItem('access_token'),
    refresh: localStorage.getItem('refresh_token')
};

// --- AUTH ---
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorEl = document.getElementById('login-error');

        try {
            const resp = await fetch(API.login, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (resp.ok) {
                const data = await resp.json();
                tokens.access = data.access;
                tokens.refresh = data.refresh;
                localStorage.setItem('access_token', tokens.access);
                localStorage.setItem('refresh_token', tokens.refresh);
                localStorage.setItem('username', username);
                initApp();
            } else {
                errorEl.innerText = "AUTHORIZATION FAILED: INVALID CREDENTIALS";
            }
        } catch (err) {
            errorEl.innerText = "COMMUNICATION ERROR: SYSTEM OFFLINE";
        }
    });
}

function logout() {
    localStorage.clear();
    location.reload();
}

document.getElementById('logout-btn').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
});

// --- API WRAPPER ---
async function fetchSecure(url, options = {}) {
    if (!tokens.access) return null;

    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${tokens.access}`
    };

    let resp = await fetch(url, options);

    if (resp.status === 401) {
        // Token expired, try refresh or logout
        logout();
        return null;
    }

    return resp;
}

// --- APP LOGIC ---
async function initApp() {
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('main-hud').classList.remove('hidden');
    document.getElementById('user-display').innerText = localStorage.getItem('username');

    loadFiles();
    const isAdmin = await loadAudit();
    if (isAdmin) {
        document.getElementById('admin-queue').classList.remove('hidden');
        loadEmergencyRequests();
    }
}

async function loadFiles() {
    const resp = await fetchSecure(API.files);
    if (!resp) return;
    const files = await resp.json();

    const listEl = document.getElementById('file-list');
    listEl.innerHTML = '';

    if (!Array.isArray(files) || files.length === 0) {
        listEl.innerHTML = '<p style="color: var(--text-dim); text-align:center; margin-top: 1rem;">[ VAULT EMPTY — UPLOAD A FILE TO BEGIN ]</p>';
        document.getElementById('total-files').innerText = 0;
        document.getElementById('expired-files').innerText = 0;
        return;
    }

    let total = files.length;
    let expired = 0;

    files.forEach(f => {
        if (f.status === 'expired' || f.status === 'destroyed') expired++;

        const card = document.createElement('div');
        card.className = 'file-card';
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong style="color: var(--primary-cyan);">${f.filename}</strong><br>
                    <span style="font-size: 0.7rem; color: var(--text-dim);">ID: ${f.id}</span>
                </div>
                <div style="text-align: right;">
                    <span class="status-badge status-${f.status}">${f.status.toUpperCase()}</span><br>
                    <span style="font-size: 0.7rem; color: var(--text-dim);">Expires: ${new Date(f.ttl_expiry).toLocaleString()}</span>
                </div>
            </div>
            <div style="margin-top: 1rem; display: flex; gap: 10px;">
                ${f.status === 'active' ? `<button class="btn" style="padding: 0.3rem 0.8rem; font-size: 0.7rem;" onclick="downloadFile('${f.id}')">DOWNLOAD</button>` : ''}
                <button class="btn btn-danger" style="padding: 0.3rem 0.8rem; font-size: 0.7rem;" onclick="copyId('${f.id}')">COPY ID</button>
            </div>
        `;
        listEl.appendChild(card);
    });

    document.getElementById('total-files').innerText = total;
    document.getElementById('expired-files').innerText = expired;
}

async function downloadFile(id) {
    const resp = await fetchSecure(`${API.files}${id}/download/`);
    if (resp && resp.ok) {
        const blob = await resp.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // Try to get filename from header
        const disposition = resp.headers.get('Content-Disposition');
        let filename = 'downloaded_file';
        if (disposition && disposition.indexOf('attachment') !== -1) {
            const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
            const matches = filenameRegex.exec(disposition);
            if (matches != null && matches[1]) filename = matches[1].replace(/[ '"]/g, '');
        }
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        loadAudit(); // Refresh audit
        loadFiles(); // Refresh counts
    } else {
        const data = await resp.json();
        alert(`ACCESS DENIED: ${data.error || 'Unknown Error'}`);
    }
}

// --- UPLOAD ---
const uploadForm = document.getElementById('upload-form');
if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('file-input');
        const ttlInput = document.getElementById('ttl-input');
        const limitInput = document.getElementById('limit-input');
        const statusEl = document.getElementById('upload-status');

        if (!fileInput.files[0]) return;

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('ttl_hours', ttlInput.value);
        formData.append('access_limit', limitInput.value);

        statusEl.innerText = "ENCRYPTING PAYLOAD...";
        statusEl.style.color = 'var(--primary-lime)';

        const resp = await fetchSecure(API.files, {
            method: 'POST',
            body: formData
        });

        if (resp && resp.ok) {
            statusEl.innerText = "UPLOAD COMPLETE. KEY SECURED.";
            statusEl.style.color = 'var(--primary-lime)';
            uploadForm.reset();
            setTimeout(() => {
                statusEl.innerText = "";
                loadFiles();
                loadAudit();
            }, 2000);
        } else {
            statusEl.innerText = "UPLOAD FAILED: ENCRYPTION ERROR";
            statusEl.style.color = 'var(--danger)';
        }
    });
}

// --- AUDIT ---
async function loadAudit() {
    const resp = await fetchSecure(API.audit);
    if (!resp) return false;

    const miniEl = document.getElementById('audit-mini');
    miniEl.innerHTML = '';

    // Regular users don't have access to audit logs
    if (!resp.ok) {
        miniEl.innerHTML = '<span style="color: var(--text-dim); font-size:0.75rem;">[ RESTRICTED — ADMIN/COMPLIANCE ONLY ]</span>';
        return false;
    }

    const logs = await resp.json();
    if (!Array.isArray(logs) || logs.length === 0) {
        miniEl.innerHTML = '<span style="color: var(--text-dim);">No events logged yet.</span>';
        return true;
    }

    logs.slice(0, 10).forEach(log => {
        const item = document.createElement('div');
        item.style.marginBottom = '8px';
        item.style.paddingBottom = '4px';
        item.style.borderBottom = '1px solid rgba(0,242,255,0.1)';
        item.innerHTML = `
            <span style="color: var(--primary-cyan)">[${new Date(log.timestamp).toLocaleTimeString()}]</span> 
            <span style="color: var(--primary-lime)">${log.action_type}</span><br>
            <span style="color: var(--text-dim)">${log.details || 'System event triggered'}</span>
        `;
        miniEl.appendChild(item);
    });
    return true;
}

// --- EMERGENCY QUEUE ---
async function loadEmergencyRequests() {
    const resp = await fetchSecure(API.emergency);
    if (!resp || !resp.ok) return;

    const reqs = await resp.json();
    const listEl = document.getElementById('emergency-list');
    listEl.innerHTML = '';

    const pending = reqs.filter(r => r.status === 'pending');

    if (pending.length === 0) {
        listEl.innerHTML = '<p style="color: var(--text-dim);">No pending authorizations.</p>';
        return;
    }

    pending.forEach(req => {
        const item = document.createElement('div');
        item.className = 'file-card';
        item.style.padding = '0.5rem';
        item.style.marginBottom = '0.5rem';
        item.style.borderLeft = '2px solid var(--warning)';
        item.innerHTML = `
            <div style="font-size: 0.65rem; color: var(--text-dim); margin-bottom: 0.3rem;">
                REQUESTED BY: <span style="color: var(--primary-cyan)">${req.requested_by_username}</span>
            </div>
            <div style="font-weight: bold; margin-bottom: 0.3rem;">FILE: ${req.file_name}</div>
            <div style="font-size: 0.7rem; color: var(--text-dim); font-style: italic; margin-bottom: 0.5rem;">
                "${req.reason}"
            </div>
            <button class="btn" style="width: 100%; padding: 0.2rem; font-size: 0.65rem;" onclick="approveEmergency(${req.id})">APPROVE ACCESS</button>
        `;
        listEl.appendChild(item);
    });
}

window.approveEmergency = async (id) => {
    const resp = await fetchSecure(`${API.emergency}${id}/approve/`, {
        method: 'POST'
    });

    if (resp && resp.ok) {
        alert("ACCESS GRANTED. LOG RECORDED.");
        loadEmergencyRequests();
        loadAudit();
    } else {
        alert("AUTHORIZATION FAILED.");
    }
};

// --- MODALS ---
window.showEmergency = () => {
    document.getElementById('emergency-modal').classList.remove('hidden');
};

window.hideEmergency = () => {
    document.getElementById('emergency-modal').classList.add('hidden');
};

window.submitEmergency = async () => {
    const fileId = document.getElementById('target-file-id').value;
    const reason = document.getElementById('emergency-reason').value;

    if (!fileId || !reason) return alert("MISSING PARAMETERS");

    const resp = await fetchSecure(API.emergency, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: fileId, reason: reason })
    });

    if (resp && resp.ok) {
        alert("EMERGENCY PROTOCOL INITIATED. AWAITING DUAL AUTH.");
        hideEmergency();
        loadAudit();
    } else {
        alert("PROTOCOL FAILED: INVALID FILE ID");
    }
};

window.copyId = (id) => {
    navigator.clipboard.writeText(id);
    alert("ID COPIED TO BUFFER");
};

// Check if already logged in
if (tokens.access) {
    initApp();
}
