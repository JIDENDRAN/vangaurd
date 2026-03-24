document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('create-user-modal');
    const openBtn = document.getElementById('open-create-modal');
    const closeBtn = document.getElementById('close-modal');
    const form = document.getElementById('create-user-form');
    const userListBody = document.getElementById('user-list-body');
    const errorDiv = document.getElementById('form-error');

    // Load initial user list
    loadUsers();

    // Modal behavior
    openBtn.onclick = () => {
        modal.classList.remove('hidden');
        errorDiv.style.display = 'none';
    };
    closeBtn.onclick = () => modal.classList.add('hidden');
    window.onclick = (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    };

    // Form submission
    form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('submit-btn');
        const username = document.getElementById('new-username').value;
        const password = document.getElementById('new-password').value;
        const role = document.getElementById('new-role').value;

        btn.disabled = true;
        btn.innerText = 'Provisioning...';
        errorDiv.style.display = 'none';

        try {
            const resp = await fetchSecure('/api/auth/users/create/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, role })
            });

            if (resp && resp.ok) {
                form.reset();
                modal.classList.add('hidden');
                loadUsers(); // Refresh list
            } else {
                const data = await resp.json();
                errorDiv.innerText = data.error || 'Provisioning failed. Check registry logs.';
                errorDiv.style.display = 'block';
            }
        } catch (err) {
            errorDiv.innerText = 'Network error during provisioning.';
            errorDiv.style.display = 'block';
        } finally {
            btn.disabled = false;
            btn.innerText = 'Finalize Provisioning';
        }
    };

    async function loadUsers() {
        try {
            const resp = await fetchSecure('/api/auth/users/');
            if (!resp || !resp.ok) return;

            const users = await resp.json();
            renderUsers(users);
        } catch (err) {
            console.error('Failed to load personnel:', err);
        }
    }

    function renderUsers(users) {
        userListBody.innerHTML = '';
        users.forEach(u => {
            const tr = document.createElement('tr');
            const roleLabel = u.role === 'admin' ? 'Master Administrator' : 'Standard Operator';
            const clearanceBadge = u.role === 'admin' ? 'LEVEL 5 (ADMIN)' : 'LEVEL 2 (USER)';
            const clearanceClass = u.role === 'admin' ? 'badge-primary' : 'badge-info';

            tr.innerHTML = `
                <td style="padding: 1.25rem 1.5rem;">
                    <div style="font-weight: 700; color: var(--text-main); font-size: 0.9rem;">${u.username}</div>
                    <div style="font-size: 0.7rem; color: var(--text-dim); margin-top: 0.1rem; font-weight: 500;">${roleLabel}</div>
                </td>
                <td style="padding: 1.25rem 1.5rem;">
                    <span class="badge ${clearanceClass}" style="padding: 0.4rem 0.75rem; font-size: 0.65rem; border-radius: 6px;">${clearanceBadge}</span>
                </td>
                <td style="padding: 1.25rem 1.5rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span style="width: 8px; height: 8px; background: var(--success); border-radius: 50%; box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);"></span>
                        <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-main);">ENCRYPTED</span>
                    </div>
                </td>
            `;
            userListBody.appendChild(tr);
        });
    }
});
