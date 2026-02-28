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
    const resp = await fetchSecure(API.audit);
    if (resp && resp.ok) {
        const auditItem = document.getElementById('audit-nav-item');
        if (auditItem) auditItem.classList.remove('hidden');
        localStorage.setItem('is_admin', 'true');
    } else {
        localStorage.removeItem('is_admin');
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

    let resp = await fetch(url, options);

    if (resp.status === 401) {
        logout();
        return null;
    }
    return resp;
}

/* ---- Secure Viewer Core Logic ---- */
window.viewFile = async function (id) {
    const modal = document.getElementById('secure-viewer-modal');
    const container = document.getElementById('viewer-container');
    if (!modal || !container) return;

    // Show loading state
    const btn = event.target;
    const oldText = btn.innerText;
    btn.innerText = '⟳ SECURING...';
    btn.disabled = true;

    const resp = await fetchSecure(`${API.files}${id}/download/`);
    btn.innerText = oldText;
    btn.disabled = false;

    if (resp && resp.ok) {
        const contentType = resp.headers.get('Content-Type') || '';
        const blob = await resp.blob();
        const url = window.URL.createObjectURL(blob);
        const username = localStorage.getItem('username') || 'VANGUARD-SECURE';

        let innerContent = '';

        if (contentType.startsWith('image/')) {
            // Secure Image View
            innerContent = `<img src="${url}" style="max-width:90%; max-height:90%; box-shadow:0 0 50px rgba(0,0,0,0.5); pointer-events:none; user-select:none;">
                            <div style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:10; background:transparent;"></div>`;
        } else if (contentType.startsWith('text/') || contentType === 'application/json' || contentType === 'application/xml') {
            // Textual View (Logs, code, etc)
            const text = await blob.text();
            innerContent = `<div style="width:80%; height:80%; background:#111; color:var(--primary-lime); font-family:monospace; padding:2rem; overflow:auto; border:1px solid var(--border-cyan); white-space:pre-wrap; font-size:0.85rem;">${escHtml(text)}</div>`;
        } else if (contentType === 'application/pdf') {
            // PDF View
            innerContent = `<iframe src="${url}#toolbar=0" style="width:100%; height:100%; border:none; background:#fff;" allowfullscreen></iframe>
                            <div style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:10; background:transparent;"></div>`;
        } else {
            // Fallback for types browsers can't natively "view" safely in an iframe without download (like .docx)
            innerContent = `
                <div style="text-align:center; color:white;">
                    <div style="font-size:4rem; margin-bottom:1rem; opacity:0.3;">⬡</div>
                    <h3>PREVIEW NOT SUPPORTED</h3>
                    <p style="color:var(--text-dim); margin-top:0.5rem; font-size:0.85rem;">Mime-Type: ${contentType}</p>
                    <p style="margin-top:2rem; font-size:0.75rem; color:var(--danger);">⚠ Standard browsers cannot natively render this format within the secure sandbox.</p>
                </div>
            `;
        }

        container.innerHTML = `
            ${innerContent}
            <div id="secure-watermark" style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:11; pointer-events:none; 
                        display:grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); 
                        opacity:0.12; font-size:1.5rem; font-weight:bold; color:var(--primary-cyan); transform:rotate(-30deg); justify-items:center; align-items:center;">
                ${Array(9).fill(`<div>${username} • ${new Date().toLocaleDateString()}</div>`).join('')}
            </div>
        `;

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
