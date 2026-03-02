/* workspaces.js – Workspace tree & management */
window.Workspaces = (function () {
    let workspaces = [];

    async function load() {
        try {
            const data = await API.get('/api/workspaces');
            workspaces = data.workspaces || [];
            renderTree();
            return workspaces;
        } catch { return []; }
    }

    function getAll() { return workspaces; }

    function buildTree(items, parentId = null) {
        return items
            .filter(w => w.parent_id === parentId)
            .map(w => ({
                ...w,
                children: buildTree(items, w.id)
            }));
    }

    function renderTree() {
        const container = document.getElementById('workspace-tree');
        const tree = buildTree(workspaces);
        container.innerHTML = '';
        tree.forEach(ws => renderNode(ws, container, false));
    }

    function renderNode(ws, container, isSub) {
        const btn = document.createElement('button');
        btn.className = 'nav-item' + (isSub ? ' sub' : '');
        btn.dataset.wsId = ws.id;
        btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      <span>${escapeHtml(ws.name)}</span>
    `;
        btn.addEventListener('click', () => window.App.openWorkspace(ws));
        container.appendChild(btn);
        ws.children.forEach(child => renderNode(child, container, true));
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    // ── Add workspace modal ──
    document.getElementById('btn-add-workspace').addEventListener('click', () => {
        if (window.innerWidth <= 900) document.body.classList.remove('sidebar-open');
        const modal = document.getElementById('ws-add-modal');
        const nameInput = document.getElementById('ws-add-name');
        const parentSelect = document.getElementById('ws-add-parent');
        nameInput.value = '';
        parentSelect.innerHTML = `<option value="">${window.t ? t('workspace.modal.parentNone') : 'Kein (Haupt-Workspace)'}</option>`;
        workspaces.forEach(ws => {
            const opt = document.createElement('option');
            opt.value = ws.id;
            opt.textContent = ws.name;
            parentSelect.appendChild(opt);
        });
        modal.classList.remove('hidden');
        nameInput.focus();
    });

    document.getElementById('btn-ws-add-cancel').addEventListener('click', () => {
        document.getElementById('ws-add-modal').classList.add('hidden');
    });

    document.getElementById('ws-add-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
    });

    document.getElementById('btn-ws-add-confirm').addEventListener('click', async () => {
        const name = document.getElementById('ws-add-name').value.trim();
        const parentId = document.getElementById('ws-add-parent').value || null;
        if (!name) return;
        try {
            await API.post('/api/workspaces', { name, parent_id: parentId ? parseInt(parentId) : null });
            await load();
            document.getElementById('ws-add-modal').classList.add('hidden');
            toast(window.t ? t('toast.workspaceCreated') : 'Workspace erstellt');
        } catch (err) { toast(window.t ? t('toast.errorPrefix', { message: err.message }) : 'Fehler: ' + err.message); }
    });

    return { load, getAll, renderTree, buildTree };
})();
