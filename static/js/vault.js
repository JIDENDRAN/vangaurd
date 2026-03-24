/* vault.js — Full encrypted file registry with filter & search */

let allFiles = [];
let currentFilter = 'all';
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    await fetchUser();
    await loadVault();
});

async function fetchUser() {
    const resp = await fetchSecure(API.me);
    if (resp && resp.ok) {
        currentUser = await resp.json();
    }
}

async function loadVault() {
    const resp = await fetchSecure(API.files);
    const tbody = document.getElementById('vault-body');
    if (!resp || !resp.ok) {
        tbody.innerHTML = '<tr><td colspan="5" style="color:var(--danger);text-align:center;padding:3rem;">FAILED TO LOAD VAULT — CHECK CONNECTION</td></tr>';
        return;
    }
    allFiles = await resp.json();
    renderVault();
}

function renderVault() {
    const search = (document.getElementById('vault-search')?.value || '').toLowerCase();

    let filtered = allFiles.filter(f => {
        const expiry = new Date(f.ttl_expiry);
        const isExpired = expiry < new Date();
        const effectiveStatus = (f.status === 'active' && isExpired) ? 'expired' : f.status;

        let matchFilter = false;
        if (currentFilter === 'all') {
            matchFilter = true;
        } else if (currentFilter === 'active') {
            matchFilter = (effectiveStatus === 'active' || effectiveStatus === 'expired');
        } else {
            matchFilter = (f.status === currentFilter);
        }

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

    const isAdmin = currentUser && (currentUser.role?.toLowerCase() === 'admin' || currentUser.is_superuser);

    tbody.innerHTML = filtered.map(f => {
        const expiry = new Date(f.ttl_expiry);
        const isExpired = expiry < new Date();
        const effectiveStatus = (f.status === 'active' && isExpired) ? 'expired' : f.status;

        const badgeClass = `badge badge-${getStatusType(effectiveStatus)}`;

        const expiryStr = isExpired
            ? `<span style="color:var(--danger); font-weight: 600;">${expiry.toLocaleString()} ⚠️</span>`
            : expiry.toLocaleString();

        const accessInfo = f.access_limit > 0
            ? `${f.access_count} / ${f.access_limit}`
            : `${f.access_count} / ∞`;

        let actionButtons = `<button class="btn btn-outline" style="padding: 0.4rem 0.6rem; font-size: 0.75rem;" onclick="copyId('${escHtml(f.id)}')">📋 ID</button>`;

        if (f.status === 'active' && !isExpired) {
            actionButtons = `<button class="btn btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.75rem;" onclick="viewFile('${escHtml(f.id)}')">👁️ VIEW</button>` + actionButtons;
        } else {
            if (isAdmin || f.has_emergency_access) {
                const label = isAdmin ? '👁️ ADMIN VIEW' : '👁️ EMERGENCY VIEW';
                actionButtons = `<button class="btn btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; background: var(--danger); border: none;" onclick="viewFile('${escHtml(f.id)}')">${label}</button>` + actionButtons;
            } else {
                actionButtons = `<a href="/emergency/?file_id=${escHtml(f.id)}" class="btn btn-outline" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; color: var(--warning); border-color: var(--warning); text-decoration: none;">🛡️ OVERRIDE</a>` + actionButtons;
            }
        }

        return `
        <tr>
            <td>
                <div style="font-weight: 600; color: var(--text-main);">${escHtml(f.filename)}</div>
                <div style="font-size: 0.65rem; color: var(--text-dim); font-family: monospace;">${escHtml(f.id)}</div>
            </td>
            <td><span class="${badgeClass}">${effectiveStatus.toUpperCase()}</span></td>
            <td style="font-size: 0.8rem;">${expiryStr}</td>
            <td style="font-size: 0.8rem; text-align: center; color: var(--text-muted);">${accessInfo}</td>
            <td>
                <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
                    ${actionButtons}
                </div>
            </td>
        </tr>`;
    }).join('');
}

function getStatusType(status) {
    if (status === 'active') return 'success';
    if (status === 'expired') return 'warning';
    if (status === 'destroyed') return 'danger';
    return 'info';
}

window.copyId = (id) => {
    navigator.clipboard.writeText(id).then(() => {
        showToast('UUID copied to clipboard', 'info');
    });
};

window.setFilter = (btn, filter) => {
    const parent = btn.parentElement;
    parent.querySelectorAll('.btn').forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.boxShadow = 'none';
    });
    btn.classList.add('active');
    btn.style.background = 'white';
    btn.style.boxShadow = 'var(--shadow-sm)';

    currentFilter = filter;
    renderVault();
};

window.filterFiles = () => renderVault();

/* ---- Toast Notification ---- */
function showToast(msg, type = 'info') {
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
    toast.innerHTML = `<span>⚡</span> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
