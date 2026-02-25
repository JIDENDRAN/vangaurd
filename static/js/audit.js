/* audit.js — Full forensic audit trail with filters, search, and stats */

let allLogs = [];
let activeTypeFilter = '';

document.addEventListener('DOMContentLoaded', async () => {
    await loadAuditLogs();
});

async function loadAuditLogs() {
    const resp = await fetchSecure(API.audit);
    const tbody = document.getElementById('audit-body');
    const restrictedEl = document.getElementById('audit-restricted');

    if (!resp) return;

    if (!resp.ok) {
        // Non-admin: hide table, show restricted banner
        document.getElementById('audit-full-table')?.classList.add('hidden');
        restrictedEl?.classList.remove('hidden');
        return;
    }

    allLogs = await resp.json();
    if (!Array.isArray(allLogs)) allLogs = [];

    renderStats(allLogs);
    renderTable(allLogs);
}

/* ---- Render Stats Row ---- */
function renderStats(logs) {
    const total = logs.length;
    const uploads = logs.filter(l => l.action_type.includes('UPLOAD')).length;
    const downloads = logs.filter(l => l.action_type.includes('DOWNLOAD')).length;
    const emergency = logs.filter(l => l.action_type.includes('EMERGENCY')).length;

    animateCount('stat-total', total);
    animateCount('stat-uploads', uploads);
    animateCount('stat-downloads', downloads);
    animateCount('stat-emergency', emergency);
}

/* ---- Render Audit Table ---- */
function renderTable(logs) {
    const search = (document.getElementById('audit-search')?.value || '').toLowerCase();
    const filtered = logs.filter(l => {
        const matchType = !activeTypeFilter || l.action_type.includes(activeTypeFilter);
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
        tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text-dim);text-align:center;padding:2rem;">[ NO MATCHING RECORDS ]</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(log => {
        const ts = new Date(log.timestamp);
        const dateStr = ts.toLocaleDateString();
        const timeStr = ts.toLocaleTimeString();
        const eventClass = eventTypeClass(log.action_type);
        const badge = eventBadge(log.action_type);

        return `
        <tr class="audit-row" style="border-bottom:1px solid rgba(0,242,255,0.06);">
            <td style="font-size:0.75rem;white-space:nowrap;">
                <span style="color:var(--primary-cyan);">${timeStr}</span><br>
                <span style="color:var(--text-dim);font-size:0.65rem;">${dateStr}</span>
            </td>
            <td style="font-size:0.80rem;color:var(--primary-cyan);">
                ${escHtml(log.user_username || log.user || '—')}
            </td>
            <td>
                <span class="status-badge ${eventClass}" style="font-size:0.65rem;">${badge}</span>
            </td>
            <td style="font-size:0.78rem;">${escHtml(log.file_name || log.file || '—')}</td>
            <td style="font-size:0.72rem;color:var(--text-dim);">${escHtml(log.ip_address || '—')}</td>
            <td style="font-size:0.78rem;color:var(--text-dim);max-width:280px;">${escHtml(log.details || '—')}</td>
        </tr>`;
    }).join('');
}

/* ---- Filter Handlers ---- */
window.setAuditFilter = (btn, type) => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTypeFilter = type;
    renderTable(allLogs);
};

window.filterAudit = () => renderTable(allLogs);

/* ---- Helpers ---- */
function eventTypeClass(type) {
    if (type.includes('UPLOAD')) return 'event-upload';
    if (type.includes('DOWNLOAD')) return 'event-download';
    if (type.includes('EMERGENCY')) return 'event-emergency';
    return 'event-other';
}

function eventBadge(type) {
    if (type.includes('UPLOAD')) return type.replace(/_/g, ' ');
    if (type.includes('DOWNLOAD')) return type.replace(/_/g, ' ');
    if (type.includes('EMERGENCY')) return type.replace(/_/g, ' ');
    return type.replace(/_/g, ' ');
}

function animateCount(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    let current = 0;
    const step = Math.max(1, Math.ceil(target / 25));
    const timer = setInterval(() => {
        current = Math.min(current + step, target);
        el.textContent = current;
        if (current >= target) clearInterval(timer);
    }, 35);
}

function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
