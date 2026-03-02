/* sorting.js – Einordnungsmaschine / Swipe sorting */
window.Sorting = (function () {
    let stack = [];
    let currentIdx = 0;
    let isDragging = false;
    let startX = 0, startY = 0;
    let currentCard = null;

    const stackEl = document.getElementById('sort-stack');
    const emptyEl = document.getElementById('sort-empty');

    // ── Load inbox notes into sorting stack ────────────────────────────────
    async function load() {
        try {
            const data = await API.get('/api/notes?location=inbox');
            stack = data.notes || [];
            currentIdx = 0;
            render();
        } catch { toast(window.t ? t('toast.errorLoad') : 'Fehler beim Laden'); }
    }

    function render() {
        // Remove all sort-card elements
        stackEl.querySelectorAll('.sort-card').forEach(c => c.remove());
        emptyEl.classList.add('hidden');

        const remaining = stack.slice(currentIdx);
        if (!remaining.length) {
            emptyEl.classList.remove('hidden');
            return;
        }

        // Render up to 3 cards (active + 2 behind)
        const toShow = remaining.slice(0, 3).reverse();
        toShow.forEach((note, i) => {
            const card = buildCard(note, i === toShow.length - 1);
            stackEl.appendChild(card);
        });

        // Attach drag listeners to top card
        currentCard = stackEl.querySelector('.sort-card.active-card');
        if (currentCard) attachDrag(currentCard);
    }

    function buildCard(note, isActive) {
        const card = document.createElement('div');
        let cls = 'sort-card';
        if (isActive) cls += ' active-card';
        else {
            // Calculate depth
            const remaining = stack.slice(currentIdx);
            const idx = remaining.indexOf(note);
            cls += idx === 1 ? ' behind-1' : ' behind-2';
        }
        card.className = cls;
        card.dataset.noteId = note.id;

        let prefixHtml = '';
        if (note.prefix) {
            prefixHtml = `<span class="note-card-prefix sort-card-prefix ${note.prefix}">${note.prefix}</span>`;
        }

        const preview = Notes.stripHtml(note.content).trim().slice(0, 300);

        card.innerHTML = `
      <span class="sort-card-label archive">${window.t ? t('sort.hint.archive') : 'Archiv'}</span>
      <span class="sort-card-label workspace">${window.t ? t('sort.hint.workspace') : 'Workspace'}</span>
      <span class="sort-card-label keep">${window.t ? t('sort.btn.keep') : 'Behalten'}</span>
      <span class="sort-card-label delete">${window.t ? t('sort.hint.delete') : 'Löschen'}</span>
      ${prefixHtml}
      <div class="sort-card-title">${escapeHtml(note.title)}</div>
      ${preview ? `<div class="sort-card-content">${escapeHtml(preview)}</div>` : ''}
    `;
        return card;
    }

    function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    // ── Drag / swipe ─────────────────────────────────────────────────────────
    function getEventPos(e) {
        if (e.clientX !== undefined) return { x: e.clientX, y: e.clientY };
        if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
        return { x: startX, y: startY }; // Fallback to start
    }

    function attachDrag(card) {
        card.addEventListener('pointerdown', onDown);
    }

    function onDown(e) {
        isDragging = true;
        const pos = getEventPos(e);
        startX = pos.x;
        startY = pos.y;
        currentCard.style.transition = 'none';
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
    }

    function onMove(e) {
        if (!isDragging || !currentCard) return;

        // Prevent browser gestures (like back/forward or pull-to-refresh)
        if (e.cancelable) e.preventDefault();

        const pos = getEventPos(e);
        const dx = pos.x - startX;
        const dy = pos.y - startY;
        const rotation = dx * 0.06;
        currentCard.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotation}deg)`;

        // Hint labels
        const labels = {
            archive: currentCard.querySelector('.sort-card-label.archive'),
            workspace: currentCard.querySelector('.sort-card-label.workspace'),
            keep: currentCard.querySelector('.sort-card-label.keep'),
            delete: currentCard.querySelector('.sort-card-label.delete')
        };

        // Reset all
        Object.values(labels).forEach(l => l && (l.style.opacity = 0));

        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        if (absY > absX && absY > 40) { // Prioritize vertical if significant
            if (dy < 0) labels.keep.style.opacity = Math.min(1, absY / 120);
            else if (dy > 0) labels.delete.style.opacity = Math.min(1, absY / 120);
        } else if (absX > absY && absX > 40) { // Then horizontal
            if (dx < 0) labels.archive.style.opacity = Math.min(1, absX / 120);
            else if (dx > 0) labels.workspace.style.opacity = Math.min(1, absX / 120);
        }
    }

    function onUp(e) {
        if (!isDragging) return;
        finishDrag(e);
    }

    function onCancel() {
        if (!isDragging) return;
        isDragging = false;
        cleanupDrag();
        currentCard.style.transform = '';
        currentCard.querySelectorAll('.sort-card-label').forEach(l => l.style.opacity = 0);
    }

    function cleanupDrag() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
    }

    function finishDrag(e) {
        isDragging = false;
        cleanupDrag();
        if (!currentCard) return;

        const pos = getEventPos(e);
        const dx = pos.x - startX;
        const dy = pos.y - startY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        const threshold = 60; // Slightly lower threshold

        currentCard.style.transition = '';

        if (absX > threshold && absX > absY) {
            if (dx < 0) act('archive');
            else act('workspace');
        } else if (absY > threshold) {
            if (dy < 0) act('keep');
            else act('delete');
        } else {
            currentCard.style.transform = '';
        }

        currentCard.querySelectorAll('.sort-card-label').forEach(l => l.style.opacity = 0);
    }

    // ── Actions ───────────────────────────────────────────────────────────────
    async function act(action) {
        if (currentIdx >= stack.length) return;
        const note = stack[currentIdx];

        if (action === 'archive') {
            await animateAndNext('swipe-left');
            await API.patch(`/api/notes/${note.id}/move`, { location: 'archive' });
            toast(window.t ? t('toast.archive') : 'Archiviert');
        } else if (action === 'keep') {
            await animateAndNext('swipe-up');
            toast(window.t ? t('toast.keep') : 'Behalten');
        } else if (action === 'delete') {
            if (confirm(window.t ? t('toast.confirmDelete') : 'Notiz wirklich löschen?')) {
                await animateAndNext('swipe-down');
                await API.delete(`/api/notes/${note.id}`);
                toast(window.t ? t('toast.noteDeleted') : 'Gelöscht');
            } else {
                currentCard && (currentCard.style.transform = '');
            }
        } else if (action === 'workspace') {
            showWorkspacePicker(note);
        }
    }

    async function animateAndNext(animClass) {
        if (!currentCard) { nextCard(); return; }
        currentCard.classList.add(animClass);
        await new Promise(r => setTimeout(r, 380));
        nextCard();
    }

    function nextCard() {
        currentIdx++;
        render();
        // Update inbox badge
        if (window.App) App.updateInboxBadge();
    }

    // ── Workspace picker ─────────────────────────────────────────────────────
    function showWorkspacePicker(note) {
        const picker = document.getElementById('sort-workspace-picker');
        const listEl = document.getElementById('sort-ws-list');
        const wsList = Workspaces.getAll();

        listEl.innerHTML = '';
        if (!wsList.length) {
            listEl.innerHTML = `<p style=\"color:var(--text3);font-size:.84rem;\">${window.t ? t('toast.noWorkspaces') : 'Noch keine Workspaces. Bitte zuerst einen erstellen.'}</p>`;
        }
        wsList.forEach(ws => {
            const item = document.createElement('div');
            item.className = 'ws-picker-item';
            item.textContent = ws.name;
            item.addEventListener('click', async () => {
                picker.classList.add('hidden');
                currentCard && (currentCard.style.transform = '');
                await animateAndNext('swipe-right');
                await API.patch(`/api/notes/${note.id}/move`, { location: 'workspace', workspace_id: ws.id });
                toast(window.t ? t('toast.movedTo', { name: ws.name }) : `In \"${ws.name}\" verschoben`);
            });
            listEl.appendChild(item);
        });

        picker.classList.remove('hidden');
    }

    document.getElementById('cancel-ws-pick').addEventListener('click', () => {
        document.getElementById('sort-workspace-picker').classList.add('hidden');
        if (currentCard) currentCard.style.transform = '';
    });

    // ── Button actions ────────────────────────────────────────────────────────
    document.getElementById('btn-sort-archive').addEventListener('click', () => act('archive'));
    document.getElementById('btn-sort-keep').addEventListener('click', () => act('keep'));
    document.getElementById('btn-sort-workspace').addEventListener('click', () => act('workspace'));
    document.getElementById('btn-sort-delete').addEventListener('click', () => act('delete'));

    return { load };
})();
