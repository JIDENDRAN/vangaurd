/* auth.js — Shared auth guard + API helpers, loaded on every page */

const API = {
    login: '/api/auth/login/',
    files: '/api/files/',
    audit: '/api/audit/',
    emergency: '/api/emergency/',
    me: '/api/auth/me/'
};

let tokens = {
    access: localStorage.getItem('access_token'),
    refresh: localStorage.getItem('refresh_token')
};

function logout() {
    localStorage.clear();
    window.location.href = '/';
}

/* Auth guard: redirect to login if not authenticated */
(function guardPage() {
    // Only guard pages inside app-shell (not the login page itself)
    if (document.getElementById('app-shell')) {
        if (!tokens.access) {
            window.location.href = '/';
            return;
        }
        // Show the shell + update user display
        document.getElementById('app-shell').classList.remove('hidden');
        const userEl = document.getElementById('user-display-nav');
        if (userEl) userEl.textContent = localStorage.getItem('username') || '---';

        // Show audit nav for admin/compliance (we can't know role client-side without
        // an API call; we'll reveal it after checking the audit endpoint responses)
        checkAdminUI();
    }
})();

async function checkAdminUI() {
    const isAdmin = localStorage.getItem('is_admin') === 'true' || localStorage.getItem('is_superuser') === 'true';
    const auditItem = document.getElementById('audit-nav-item');

    if (isAdmin && auditItem) {
        auditItem.classList.remove('hidden');
    }

    // Still verify against API to be safe
    const resp = await fetchSecure(API.audit);
    if (resp && resp.ok) {
        if (auditItem) auditItem.classList.remove('hidden');
        localStorage.setItem('is_admin', 'true');
    } else {
        // Only hide if we explicitly got a 403 or 401
        if (resp && (resp.status === 403 || resp.status === 401)) {
            if (auditItem) auditItem.classList.add('hidden');
            localStorage.removeItem('is_admin');
        }
    }
}

/* ---- Logout buttons ---- */
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', (e) => { e.preventDefault(); logout(); });

    const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
    if (mobileLogoutBtn) mobileLogoutBtn.addEventListener('click', (e) => { e.preventDefault(); logout(); });
});

/* ---- Secure fetch wrapper ---- */
async function fetchSecure(url, options = {}) {
    if (!tokens.access) { logout(); return null; }

    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${tokens.access}`
    };

    let resp;
    try {
        resp = await fetch(url, options);
    } catch (err) {
        // Network error — don't logout, just return null silently
        console.warn('VANGUARD: Network error on', url, err);
        return null;
    }

    if (resp.status === 401) {
        // Try a token refresh before giving up
        const refreshed = await tryRefreshToken();
        if (!refreshed) {
            logout();
            return null;
        }
        // Retry with new token
        options.headers['Authorization'] = `Bearer ${tokens.access}`;
        try {
            resp = await fetch(url, options);
        } catch (err) {
            return null;
        }
        if (resp.status === 401) {
            logout();
            return null;
        }
    }
    return resp;
}

async function tryRefreshToken() {
    const refresh = localStorage.getItem('refresh_token');
    if (!refresh) return false;
    try {
        const r = await fetch('/api/auth/refresh/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh })
        });
        if (r.ok) {
            const data = await r.json();
            tokens.access = data.access;
            localStorage.setItem('access_token', data.access);
            return true;
        }
    } catch (e) { /* silent */ }
    return false;
}

/* ---- Secure Viewer Core Logic ---- */
window.viewFile = async function (id) {
    const modal = document.getElementById('secure-viewer-modal');
    const container = document.getElementById('viewer-container');
    if (!modal || !container) return;

    // Show loading state if called from a click event
    const btn = window.event ? window.event.currentTarget || window.event.target : null;
    const oldText = btn ? btn.innerText : null;
    if (btn && btn.tagName === 'BUTTON') {
        btn.innerText = '⟳ SECURING...';
        btn.disabled = true;
    }

    const resp = await fetchSecure(`${API.files}${id}/download/`);

    if (btn && oldText) {
        btn.innerText = oldText;
        btn.disabled = false;
    }

    if (resp && resp.ok) {
        const contentType = resp.headers.get('Content-Type') || '';
        const blob = await resp.blob();
        const url = window.URL.createObjectURL(blob);
        console.log('VANGUARD SECURE VIEW:', contentType, id);
        const username = localStorage.getItem('username') || 'VANGUARD-SECURE';
        let innerContent = '';

        if (contentType.startsWith('image/')) {
            // Secure Image View
            innerContent = `<img src="${url}" style="max-width:90%; max-height:90%; box-shadow:0 0 80px rgba(0,0,0,0.8); pointer-events:none; user-select:none; border-radius: 4px;">
                            <div style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:10; background:transparent;"></div>`;
        } else if (contentType.startsWith('text/') || contentType === 'application/json' || contentType === 'application/xml') {
            // Textual View (Logs, code, etc)
            const text = await blob.text();
            innerContent = `<div style="width:80%; max-width: 900px; height:80%; background:#111; color:var(--success); font-family: 'JetBrains Mono', monospace; padding:2.5rem; overflow:auto; border:1px solid #333; white-space:pre-wrap; font-size:0.9rem; line-height: 1.6; border-radius: 8px;">${escHtml(text)}</div>`;
        } else if (contentType === 'application/pdf') {
            // PDF View
            innerContent = `<iframe src="${url}#toolbar=0" style="width:100%; height:100%; border:none; background:#fff;" allowfullscreen></iframe>
                            <div style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:10; background:transparent;"></div>`;
        } else if (contentType.includes('word') || contentType.includes('officedocument.word') || contentType.includes('application/msword')) {
            // Word (.docx) rendering via docx-preview
            innerContent = `<div id="word-render" style="width:100%; height:100%; overflow:auto; background:#f0f0f0; padding:2rem;"></div>`;
        } else if (contentType.includes('excel') || contentType.includes('spreadsheet') || contentType.includes('officedocument.spreadsheet')) {
            // Excel rendering via SheetJS
            try {
                const data = await blob.arrayBuffer();
                const workbook = XLSX.read(data);
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const html = XLSX.utils.sheet_to_html(worksheet);
                innerContent = `<div style="width:100%; height:100%; overflow:auto; background:#fff; color:#333; padding:2rem; font-family:sans-serif;">
                                    <h4 style="color:var(--primary); margin-bottom:1rem; font-family: 'Outfit', sans-serif;">Sheet Preview: ${firstSheetName}</h4>
                                    ${html}
                                </div>`;
            } catch (err) {
                innerContent = `<div style="color:var(--danger); font-weight: 600;">ENCODING ERROR: FAILED TO RENDER SECURE SPREADSHEET</div>`;
            }
        } else {
            // Fallback for unknown types
            innerContent = `
                <div style="text-align:center; color:white;">
                    <div style="font-size:4rem; margin-bottom:1.5rem; opacity:0.3;">📦</div>
                    <h3 style="font-family: 'Outfit', sans-serif;">PREVIEW NOT SUPPORTED</h3>
                    <p style="color:var(--text-dim); margin-top:0.5rem; font-size:0.875rem;">Asset Type: ${contentType}</p>
                    <p style="margin-top:2.5rem; font-size:0.8rem; color:var(--danger); font-weight: 600;">🛡️ DEFENSIVE PROTOCOL: DOWNLOADS ARE RESTRICTED FOR THIS ASSET.</p>
                </div>
            `;
        }

        container.innerHTML = `
            ${innerContent}
            <div id="secure-watermark" style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:11; pointer-events:none; 
                        display:grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); 
                        opacity:0.1; font-size:1.2rem; font-weight:600; color:var(--primary); transform:rotate(-25deg); justify-items:center; align-items:center;">
                ${Array(9).fill(`<div>${username} • ${new Date().toLocaleDateString()}</div>`).join('')}
            </div>
        `;

        modal.classList.remove('hidden');

        // Post-processing for Word rendering
        const wordArea = document.getElementById('word-render');
        if (wordArea) {
            try {
                await docx.renderAsync(blob, wordArea);
            } catch (err) {
                wordArea.innerHTML = `<div style="color:var(--danger);">FAILED TO RENDER WORD DOCUMENT</div>`;
            }
        }

        modal.classList.remove('hidden');

        // If we're on the vault page, trigger a refresh to update the access count
        if (typeof loadVault === 'function') await loadVault();
    } else {
        const data = await resp?.json().catch(() => ({}));
        alert(`ACCESS DENIED: ${data?.error || 'Security restriction in effect.'}`);
    }
}

function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.closeSecureViewer = function () {
    const modal = document.getElementById('secure-viewer-modal');
    const container = document.getElementById('viewer-container');
    if (modal) modal.classList.add('hidden');
    if (container) container.innerHTML = '';
};

/* ---- Anti-Screenshot & Photo Restrictions ---- */
window.addEventListener('blur', () => {
    const overlay = document.getElementById('anti-screenshot-overlay');
    const modal = document.getElementById('secure-viewer-modal');
    if (overlay && modal && !modal.classList.contains('hidden')) {
        overlay.classList.remove('hidden');
    }
});

window.addEventListener('focus', () => {
    const overlay = document.getElementById('anti-screenshot-overlay');
    if (overlay) overlay.classList.add('hidden');
});

document.addEventListener('keyup', (e) => {
    if (e.key === 'PrintScreen' || e.keyCode === 44) {
        const overlay = document.getElementById('anti-screenshot-overlay');
        if (overlay) {
            overlay.classList.remove('hidden');
            setTimeout(() => overlay.classList.add('hidden'), 2000);
        }
    }
});

// Disable right click globally when viewing
document.addEventListener('contextmenu', event => {
    const modal = document.getElementById('secure-viewer-modal');
    if (modal && !modal.classList.contains('hidden')) {
        event.preventDefault();
    }
});

// Block specific known screenshot shortcuts (e.g. Win+Shift+S)
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('secure-viewer-modal');
    if (modal && !modal.classList.contains('hidden')) {
        // Block Ctrl+S, Ctrl+P, Mac Cmd+S
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'p')) {
            e.preventDefault();
            alert("SECURITY ALERT: EXPORT BLOCKED");
        }
    }
});
