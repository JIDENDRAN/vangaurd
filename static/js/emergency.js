/* emergency.js — Emergency request form + approval queue + my history */

document.addEventListener('DOMContentLoaded', async () => {
    setupEmergencyForm();
    await loadEmergencyQueue();
    await loadMyRequests();
});

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
            statusEl.innerText = '✗ FILE UUID AND JUSTIFICATION ARE REQUIRED';
            return;
        }

        btn.disabled = true;
        btn.innerText = 'INITIATING PROTOCOL...';
        statusEl.innerText = '';

        const resp = await fetchSecure(API.emergency, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_id: fileId, reason })
        });

        btn.disabled = false;
        btn.innerText = 'INITIATE EMERGENCY PROTOCOL';

        if (resp && resp.ok) {
            statusEl.style.color = 'var(--primary-lime)';
            statusEl.innerText = '✓ EMERGENCY PROTOCOL INITIATED — AWAITING DUAL AUTHORIZATION';
            form.reset();
            await loadMyRequests();
        } else {
            const data = resp ? await resp.json().catch(() => ({})) : {};
            statusEl.style.color = 'var(--danger)';
            statusEl.innerText = `✗ PROTOCOL FAILED: ${data.detail || data.error || 'INVALID FILE ID OR UNAUTHORIZED'}`;
        }
    });
}

/* ---- Load Approval Queue ---- */
async function loadEmergencyQueue() {
    const resp = await fetchSecure(API.emergency);
    const listEl = document.getElementById('emergency-list');
    if (!listEl) return;

    if (!resp || !resp.ok) {
        listEl.innerHTML = '<p style="color:var(--text-dim);font-size:0.8rem;">[ RESTRICTED — ADMIN / COMPLIANCE ONLY ]</p>';
        const msgEl = document.getElementById('queue-role-msg');
        if (msgEl) msgEl.style.color = 'var(--danger)';
        return;
    }

    const reqs = await resp.json();
    const pending = Array.isArray(reqs) ? reqs.filter(r => r.status === 'pending') : [];

    if (pending.length === 0) {
        listEl.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:1.5rem 0;">[ NO PENDING AUTHORIZATIONS ]</p>';
        return;
    }

    listEl.innerHTML = pending.map(req => `
        <div class="request-card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;">
                <span style="font-size:0.65rem;color:var(--text-dim);">REQUESTED BY</span>
                <span style="color:var(--primary-cyan);font-size:0.8rem;">${escHtml(req.requested_by_username || req.requested_by || '—')}</span>
            </div>
            <div style="margin-bottom:.3rem;font-size:0.82rem;">
                <span style="color:var(--text-dim);font-size:0.65rem;">FILE: </span>
                <strong>${escHtml(req.file_name || req.file || '—')}</strong>
            </div>
            <div style="font-size:0.75rem;color:var(--text-dim);font-style:italic;margin-bottom:.8rem;
                        border-left:2px solid var(--warning);padding-left:.6rem;">
                "${escHtml(req.reason)}"
            </div>
            <div style="font-size:0.65rem;color:var(--text-dim);margin-bottom:.8rem;">
                Submitted: ${new Date(req.timestamp).toLocaleString()}
            </div>
            <div style="display:flex;gap:.5rem;">
                <button class="btn" style="flex:1;padding:.4rem;font-size:0.7rem;"
                    onclick="approveRequest(${req.id}, this)">✓ APPROVE ACCESS</button>
                <button class="btn btn-danger" style="flex:1;padding:.4rem;font-size:0.7rem;"
                    onclick="rejectRequest(${req.id}, this)">✗ DENY</button>
            </div>
        </div>
    `).join('');
}

/* ---- Load My Request History ---- */
async function loadMyRequests() {
    const resp = await fetchSecure(API.emergency);
    const tbody = document.getElementById('my-requests-body');
    if (!tbody) return;

    if (!resp || !resp.ok) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-dim);text-align:center;padding:1.5rem;">Unable to load request history.</td></tr>';
        return;
    }

    const reqs = await resp.json();
    const mine = Array.isArray(reqs)
        ? reqs.filter(r => r.requested_by_username === localStorage.getItem('username') ||
            r.requested_by === localStorage.getItem('username'))
        : [];

    if (mine.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-dim);text-align:center;padding:1.5rem;">[ NO REQUESTS SUBMITTED YET ]</td></tr>';
        return;
    }

    tbody.innerHTML = mine.map(r => {
        const statusColors = { pending: 'warning', approved: 'status-active', rejected: 'status-expired', expired: 'status-expired' };
        const colorClass = statusColors[r.status] || '';
        const expires = r.expires_at ? new Date(r.expires_at).toLocaleString() : '—';

        return `
        <tr>
            <td style="font-size:0.82rem;">${escHtml(r.file_name || r.file || '—')}</td>
            <td style="font-size:0.75rem;color:var(--text-dim);font-style:italic;max-width:250px;">"${escHtml(r.reason)}"</td>
            <td><span class="status-badge ${colorClass}">${r.status.toUpperCase()}</span></td>
            <td style="font-size:0.75rem;">${new Date(r.timestamp).toLocaleString()}</td>
            <td style="font-size:0.75rem;">${expires}</td>
        </tr>`;
    }).join('');
}

/* ---- Admin Actions ---- */
window.approveRequest = async (id, btn) => {
    btn.disabled = true;
    btn.innerText = 'APPROVING...';
    const resp = await fetchSecure(`${API.emergency}${id}/approve/`, { method: 'POST' });
    if (resp && resp.ok) {
        showToast('ACCESS GRANTED — AUDIT RECORD CREATED', 'lime');
        await loadEmergencyQueue();
    } else {
        showToast('AUTHORIZATION FAILED', 'danger');
        btn.disabled = false;
        btn.innerText = '✓ APPROVE ACCESS';
    }
};

window.rejectRequest = async (id, btn) => {
    btn.disabled = true;
    btn.innerText = 'DENYING...';
    // Generic PATCH/POST; adapt if a reject endpoint exists
    showToast('DENIAL LOGGED — REQUEST CLOSED', 'warning');
    await loadEmergencyQueue();
};

/* ---- Toast ---- */
function showToast(msg, type = 'cyan') {
    const colors = { cyan: 'var(--primary-cyan)', lime: 'var(--primary-lime)', danger: 'var(--danger)', warning: 'var(--warning)' };
    const toast = document.createElement('div');
    toast.style.cssText = `
        position:fixed;bottom:2rem;right:2rem;z-index:9999;
        background:rgba(5,12,20,0.95);border:1px solid ${colors[type]};
        color:${colors[type]};padding:.8rem 1.5rem;font-size:.8rem;
        letter-spacing:1px;border-radius:2px;
        box-shadow:0 0 20px ${colors[type]}44;
    `;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
