/* vault.js — Full encrypted file registry with filter & search */

let allFiles = [];
let currentFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
    await loadVault();
});

async function loadVault() {
    const resp = await fetchSecure(API.files);
    if (!resp || !resp.ok) {
        renderVaultBody('<tr><td colspan="5" style="color:var(--danger);text-align:center;padding:2rem;">FAILED TO LOAD VAULT — CHECK CONNECTION</td></tr>');
        return;
    }
    allFiles = await resp.json();
    renderVault();
}

function renderVault() {
    const search = (document.getElementById('vault-search')?.value || '').toLowerCase();

    let filtered = allFiles.filter(f => {
        const matchFilter = currentFilter === 'all' || f.status === currentFilter;
        const matchSearch = !search || f.filename.toLowerCase().includes(search) || f.id.toLowerCase().includes(search);
        return matchFilter && matchSearch;
    });

    const tbody = document.getElementById('vault-body');
    const emptyEl = document.getElementById('vault-empty');

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyEl?.classList.remove('hidden');
        return;
    }
    emptyEl?.classList.add('hidden');

    tbody.innerHTML = filtered.map(f => {
        const expiry = new Date(f.ttl_expiry);
        const isExpired = expiry < new Date();
        const expiryStr = isExpired
            ? `<span style="color:var(--danger);">${expiry.toLocaleString()} ⚠</span>`
            : expiry.toLocaleString();

        const accessInfo = f.access_limit > 0
            ? `${f.access_count} / ${f.access_limit}`
            : `${f.access_count} / ∞`;

        const downloadBtn = f.status === 'active'
            ? `<button class="btn" style="padding:.3rem .7rem;font-size:0.7rem;" onclick="downloadFile('${escHtml(f.id)}')">⬇ GET</button>`
            : '';

        return `
        <tr class="vault-row" data-status="${f.status}">
            <td>
                <strong style="color:var(--primary-cyan);">${escHtml(f.filename)}</strong><br>
                <span style="font-size:0.65rem;color:var(--text-dim);">${escHtml(f.id)}</span>
            </td>
            <td><span class="status-badge status-${f.status}">${f.status.toUpperCase()}</span></td>
            <td style="font-size:0.8rem;">${expiryStr}</td>
            <td style="font-size:0.8rem;text-align:center;">${accessInfo}</td>
            <td>
                <div style="display:flex;gap:.4rem;flex-wrap:wrap;">
                    ${downloadBtn}
                    <button class="btn btn-danger" style="padding:.3rem .7rem;font-size:0.7rem;" onclick="copyId('${escHtml(f.id)}')">⎘ ID</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

async function downloadFile(id) {
    const btn = event.target;
    btn.disabled = true;
    btn.innerText = 'DECRYPTING...';

    const resp = await fetchSecure(`${API.files}${id}/download/`);
    btn.disabled = false;
    btn.innerText = '⬇ GET';

    if (resp && resp.ok) {
        const blob = await resp.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const disposition = resp.headers.get('Content-Disposition') || '';
        const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
        a.download = match ? match[1].replace(/['"]/g, '') : 'downloaded_file';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        // Refresh to update access count
        await loadVault();
    } else if (resp) {
        const data = await resp.json().catch(() => ({}));
        showToast(`ACCESS DENIED: ${data.error || 'Unknown error'}`, 'danger');
    }
}

window.copyId = (id) => {
    navigator.clipboard.writeText(id).then(() => {
        showToast('UUID COPIED TO CLIPBOARD', 'lime');
    });
};

window.setFilter = (btn, filter) => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = filter;
    renderVault();
};

window.filterFiles = () => renderVault();

/* ---- Toast Notification ---- */
function showToast(msg, type = 'cyan') {
    const colors = { cyan: 'var(--primary-cyan)', lime: 'var(--primary-lime)', danger: 'var(--danger)', warning: 'var(--warning)' };
    const toast = document.createElement('div');
    toast.style.cssText = `
        position:fixed;bottom:2rem;right:2rem;z-index:9999;
        background:rgba(5,12,20,0.95);border:1px solid ${colors[type]};
        color:${colors[type]};padding:.8rem 1.5rem;font-size:.8rem;
        letter-spacing:1px;border-radius:2px;
        box-shadow:0 0 20px ${colors[type]}44;
        animation:fadeInUp .3s ease;
    `;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
