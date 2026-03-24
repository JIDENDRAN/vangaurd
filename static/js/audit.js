/* audit.js — Full forensic audit trail with filters, search, and stats */

let allLogs = [];
let activeTypeFilter = '';

document.addEventListener('DOMContentLoaded', async () => {
    await loadAuditLogs();
});

async function loadAuditLogs() {
    console.log('VANGUARD: AUDIT_TRAIL_FETCH_START');
    const resp = await fetchSecure(API.audit);
    const tbody = document.getElementById('audit-body');
    const restrictedEl = document.getElementById('audit-restricted');

    if (!resp) {
        console.error('VANGUARD: AUDIT_TRAIL_NETWORK_FAIL');
        return;
    }

    if (!resp.ok) {
        console.warn('VANGUARD: AUDIT_TRAIL_ACCESS_DENIED', resp.status);
        document.getElementById('audit-full-table')?.classList.add('hidden');
        restrictedEl?.classList.remove('hidden');
        return;
    }

    try {
        allLogs = await resp.json();
        console.log('VANGUARD: AUDIT_TRAIL_FETCH_SUCCESS', allLogs.length);
        if (!Array.isArray(allLogs)) {
            console.error('VANGUARD: AUDIT_TRAIL_DATA_INVALID');
            allLogs = [];
        }
        renderStats(allLogs);
        renderTable(allLogs);
    } catch (err) {
        console.error('VANGUARD: AUDIT_TRAIL_PARSE_ERROR', err);
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--danger);">CRITICAL ERROR: FORENSIC DATA PARSE FAIL</td></tr>';
    }
}

/* ---- Render Stats Row ---- */
function renderStats(logs) {
    const total = logs.length;
    const uploads = logs.filter(l => l.action_type.includes('UPLOAD')).length;
    const views = logs.filter(l => l.action_type.includes('DOWNLOAD') || l.action_type.includes('VIEW')).length;
    const emergency = logs.filter(l => l.action_type.includes('EMERGENCY')).length;

    animateCount('stat-total', total);
    animateCount('stat-uploads', uploads);
    animateCount('stat-downloads', views);
    animateCount('stat-emergency', emergency);
}

/* ---- Render Audit Table ---- */
function renderTable(logs) {
    const search = (document.getElementById('audit-search')?.value || '').toLowerCase();
    const filtered = logs.filter(l => {
        const matchType = !activeTypeFilter ||
            l.action_type.includes(activeTypeFilter) ||
            (activeTypeFilter === 'FILE_VIEW' && l.action_type.includes('DOWNLOAD'));
        const matchSearch = !search ||
            l.action_type.toLowerCase().includes(search) ||
            (l.details || '').toLowerCase().includes(search) ||
            (l.user_username || '').toLowerCase().includes(search) ||
            (l.file_name || '').toLowerCase().includes(search);
        return matchType && matchSearch;
    });

    const tbody = document.getElementById('audit-body');
    if (!tbody) return;

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text-dim); text-align:center; padding:3rem;">No forensic records found matching the current filters.</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(log => {
        const ts = new Date(log.timestamp);
        const dateStr = ts.toLocaleDateString();
        const timeStr = ts.toLocaleTimeString();
        const badgeClass = `badge badge-${getEventType(log.action_type)}`;
        const displayType = log.action_type.replace(/_/g, ' ');

        return `
        <tr>
            <td style="font-size:0.8rem; white-space:nowrap;">
                <div style="font-weight: 600; color: var(--text-main);">${timeStr}</div>
                <div style="color:var(--text-dim); font-size:0.7rem;">${dateStr}</div>
            </td>
            <td style="font-weight: 500; font-size: 0.875rem; color: var(--primary);">
                ${escHtml(log.user_username || log.user || '—')}
            </td>
            <td>
                <span class="${badgeClass}">${displayType}</span>
            </td>
            <td style="font-weight: 500; font-size: 0.875rem;">${escHtml(log.file_name || log.file || '—')}</td>
            <td style="font-size:0.75rem; color:var(--text-muted); font-family: monospace;">${escHtml(log.ip_address || '—')}</td>
            <td style="font-size:0.8rem; color:var(--text-muted); max-width:300px; line-height: 1.4;">${escHtml(log.details || '—')}</td>
        </tr>`;
    }).join('');
}

function getEventType(type) {
    if (type.includes('UPLOAD')) return 'success';
    if (type.includes('DOWNLOAD') || type.includes('VIEW')) return 'primary';
    if (type.includes('EMERGENCY')) return 'warning';
    return 'info';
}

/* ---- Filter Handlers ---- */
window.setAuditFilter = (btn, type) => {
    const parent = btn.parentElement;
    parent.querySelectorAll('.btn').forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.boxShadow = 'none';
    });
    btn.classList.add('active');
    btn.style.background = 'white';
    btn.style.boxShadow = 'var(--shadow-sm)';

    activeTypeFilter = type;
    renderTable(allLogs);
};

window.filterAudit = () => renderTable(allLogs);

/* ---- Helpers ---- */
function animateCount(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    let current = 0;
    const duration = 800;
    const startTime = performance.now();

    function update(timestamp) {
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / duration, 1);
        current = progress * target;
        el.textContent = Math.floor(current).toLocaleString();

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    requestAnimationFrame(update);
}

function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
