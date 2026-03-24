/* emergency.js — Emergency request form + approval queue + my history */

document.addEventListener('DOMContentLoaded', async () => {
    setupEmergencyForm();
    handleQueryParams();
    await loadEmergencyQueue();
    await loadMyRequests();
});

function handleQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const fileId = params.get('file_id');
    if (fileId) {
        const input = document.getElementById('target-file-id');
        if (input) input.value = fileId;
    }
}

/* ---- Submit Emergency Request ---- */
function setupEmergencyForm() {
    const form = document.getElementById('emergency-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fileId = document.getElementById('target-file-id').value.trim();
        const reason = document.getElementById('emergency-reason').value.trim();
        const statusEl = document.getElementById('emergency-form-status');
        const btn = document.getElementById('emergency-submit-btn');

        if (!fileId || !reason) {
            statusEl.style.color = 'var(--danger)';
            statusEl.innerText = 'File UUID and justifications are required';
            return;
        }

        btn.disabled = true;
        btn.innerText = '🛡️ Initiating Security Overwrite...';

        const resp = await fetchSecure(API.emergency, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_id: fileId, reason })
        });

        btn.disabled = false;
        btn.innerText = 'Initiate Protocol Override';

        if (resp && resp.ok) {
            statusEl.style.color = 'var(--success)';
            statusEl.innerText = '✓ Protocol Initiated — Waiting for dual-authorization...';
            form.reset();
            await loadMyRequests();
        } else {
            const data = resp ? await resp.json().catch(() => ({})) : {};
            statusEl.style.color = 'var(--danger)';
            statusEl.innerText = `✗ Protocol Refused: ${data.detail || data.error || 'Check asset ID'}`;
        }
    });
}

/* ---- Load Approval Queue ---- */
async function loadEmergencyQueue() {
    const resp = await fetchSecure(API.emergency);
    const listEl = document.getElementById('emergency-list');
    if (!listEl) return;

    if (!resp || !resp.ok) {
        listEl.innerHTML = '<div style="padding: 2rem; border-radius: 8px; border: 1px dashed var(--danger); text-align: center; color: var(--danger); font-size: 0.8rem; font-weight: 600;">ACCESS RESTRICTED: SECURITY CLEARANCE REQUIRED</div>';
        const msgEl = document.getElementById('queue-role-msg');
        if (msgEl) {
            msgEl.textContent = "Administrative privileges are required to authorize overrides.";
            msgEl.style.color = "var(--danger)";
        }
        return;
    }

    const reqs = await resp.json();
    const pending = Array.isArray(reqs) ? reqs.filter(r => r.status === 'pending') : [];

    if (pending.length === 0) {
        listEl.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding:3rem; background: #f8fafc; border-radius: 8px;">No pending authorizations in queue.</div>';
        return;
    }

    const isAdmin = localStorage.getItem('is_admin') === 'true';

    listEl.innerHTML = pending.map(req => {
        let actionButtons = '';
        if (isAdmin) {
            actionButtons = `
                <div style="display:flex; gap:.75rem; margin-top: 1rem;">
                    <button class="btn btn-primary" style="flex:1; padding:.5rem; font-size:0.75rem; background: var(--success); border: none;"
                        onclick="approveRequest(${req.id}, this)">✓ Approve</button>
                    <button class="btn btn-danger" style="flex:1; padding:.5rem; font-size:0.75rem;"
                        onclick="rejectRequest(${req.id}, this)">✗ Deny</button>
                </div>`;
        } else {
            actionButtons = `<div style="text-align:center; font-size:0.75rem; color:var(--warning); background: var(--warning-light); padding:0.6rem; border-radius: 4px; font-weight: 600; margin-top: 1rem;">Awaiting Dual-Authorization...</div>`;
        }

        return `
        <div class="panel" style="margin-bottom: 0;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.75rem;">
                <span style="font-size:0.7rem; color:var(--text-dim); text-transform: uppercase; font-weight: 700;">Authorizer Queue Id #${req.id}</span>
                <span class="badge badge-info">${escHtml(req.requested_by_username || req.requested_by || '—')}</span>
            </div>
            <div style="margin-bottom: 0.5rem; font-size: 0.875rem;">
                <span style="color:var(--text-dim);">Target Asset: </span>
                <strong style="color: var(--text-main);">${escHtml(req.file_name || req.file || '—')}</strong>
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); font-style:italic; background: #fdfdfd; padding: 1rem; border-left: 3px solid var(--primary); border-radius: 4px; margin-bottom: 0.5rem; line-height: 1.5;">
                "${escHtml(req.reason)}"
            </div>
            <div style="font-size:0.7rem; color:var(--text-dim);">
                Submitted: ${new Date(req.timestamp).toLocaleString()}
            </div>
            ${actionButtons}
        </div>
    `}).join('');
}

/* ---- Load My Request History ---- */
async function loadMyRequests() {
    const resp = await fetchSecure(API.emergency);
    const tbody = document.getElementById('my-requests-body');
    if (!tbody) return;

    if (!resp || !resp.ok) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-dim); text-align:center; padding:3rem;">Forensic log timeout...</td></tr>';
        return;
    }

    const reqs = await resp.json();
    const mine = Array.isArray(reqs)
        ? reqs.filter(r => r.requested_by_username === localStorage.getItem('username') ||
            r.requested_by === localStorage.getItem('username'))
        : [];

    if (mine.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-dim); text-align:center; padding:3rem;">No override history has been recorded.</td></tr>';
        return;
    }

    tbody.innerHTML = mine.map(r => {
        const statusType = r.status === 'pending' ? 'warning' : (r.status === 'approved' ? 'success' : 'danger');
        const expires = r.expires_at ? new Date(r.expires_at).toLocaleString() : '—';

        return `
        <tr>
            <td style="font-weight: 600; color: var(--text-main); font-size: 0.875rem;">${escHtml(r.file_name || r.file || '—')}</td>
            <td style="font-size:0.75rem; color:var(--text-muted); font-style:italic; max-width:280px;">"${escHtml(r.reason)}"</td>
            <td><span class="badge badge-${statusType}">${r.status.toUpperCase()}</span></td>
            <td style="font-size:0.75rem; color: var(--text-muted);">${new Date(r.timestamp).toLocaleString()}</td>
            <td style="font-size:0.75rem; font-weight: 500;">${expires}</td>
        </tr>`;
    }).join('');
}

/* ---- Admin Actions ---- */
window.approveRequest = async (id, btn) => {
    btn.disabled = true;
    btn.innerText = 'Authorizing...';
    const resp = await fetchSecure(`${API.emergency}${id}/approve/`, { method: 'POST' });
    if (resp && resp.ok) {
        showToast('Access window granted — Audit log verified', 'success');
        await loadEmergencyQueue();
    } else {
        showToast('Protocol rejection: Unauthorized', 'danger');
        btn.disabled = false;
        btn.innerText = '✓ Approve';
    }
};

window.rejectRequest = async (id, btn) => {
    btn.disabled = true;
    btn.innerText = 'Locking...';
    showToast('Request denied. Final recorded in forensics.', 'info');
    await loadEmergencyQueue();
};

/* ---- Toast Notification ---- */
function showToast(msg, type = 'primary') {
    const toast = document.createElement('div');
    const color = type === 'danger' ? 'var(--danger)' : 'var(--primary)';
    toast.style.cssText = `
        position: fixed; bottom: 2rem; right: 2rem; z-index: 9999;
        background: white; border-left: 4px solid ${color};
        color: var(--text-main); padding: 1rem 1.5rem; font-size: 0.875rem;
        font-weight: 500; border-radius: var(--radius);
        box-shadow: var(--shadow-md);
        animation: fadeInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex; align-items: center; gap: 0.75rem;
    `;
    toast.innerHTML = `<span>🛡️</span> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
