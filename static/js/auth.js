/* auth.js — Shared auth guard + API helpers, loaded on every page */

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
