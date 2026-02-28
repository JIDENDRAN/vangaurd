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

        const isAdmin = localStorage.getItem('is_admin') === 'true';
        let actionButtons = `<button class="btn btn-danger" style="padding:.3rem .7rem;font-size:0.7rem;" onclick="copyId('${escHtml(f.id)}')">⎘ ID</button>`;

        if (f.status === 'active') {
            actionButtons = `<button class="btn" style="padding:.3rem .7rem;font-size:0.7rem;" onclick="viewFile('${escHtml(f.id)}')">👁 VIEW</button>` + actionButtons;
        } else if (f.status === 'expired') {
            if (isAdmin || f.has_emergency_access) {
                const label = isAdmin ? '👁 VIEW (ADMIN)' : '👁 VIEW (EMERGENCY)';
                actionButtons = `<button class="btn" style="padding:.3rem .7rem;font-size:0.7rem;border-color:var(--danger);color:var(--danger);" onclick="viewFile('${escHtml(f.id)}')">${label}</button>` + actionButtons;
            } else {
                actionButtons = `<a href="/emergency/" class="btn" style="padding:.3rem .7rem;font-size:0.7rem;border-color:var(--warning);color:var(--warning);text-decoration:none;">⚠ REQUEST ACCESS</a>` + actionButtons;
            }
        }

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
                    ${actionButtons}
                </div>
            </td>
        </tr>`;
    }).join('');
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
