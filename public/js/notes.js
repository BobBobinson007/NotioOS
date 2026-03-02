/* notes.js – Note CRUD and rendering */
window.Notes = (function () {

    function stripHtml(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || '';
    }

    function formatDate(str) {
        if (!str) return '';
        const d = new Date(str + 'Z');
        const lang = window.getLang ? getLang() : 'de';
        const localeMap = { de: 'de-DE', en: 'en-US', fr: 'fr-FR', es: 'es-ES', nl: 'nl-NL' };
        return d.toLocaleDateString(localeMap[lang] || 'de-DE', { day: '2-digit', month: 'short' });
    }

    function createCard(note, onClick) {
        const card = document.createElement('div');
        card.className = 'note-card';
        card.dataset.noteId = note.id;

        let prefixHtml = '';
        if (note.prefix) {
            prefixHtml = `<span class="note-card-prefix ${note.prefix}">${note.prefix}</span>`;
        }

        const preview = stripHtml(note.content).trim().slice(0, 160);

        card.innerHTML = `
      ${prefixHtml}
      <div class="note-card-title">${escapeHtml(note.title)}</div>
      ${preview ? `<div class="note-card-preview">${escapeHtml(preview)}</div>` : ''}
      <div class="note-card-footer">
        <span>${formatDate(note.updated_at || note.created_at)}</span>
      </div>
    `;
        card.addEventListener('click', () => onClick(note));
        return card;
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function renderEmpty(container, msg = (window.t ? t('toast.noNotes') : 'Keine Notizen')) {
        container.innerHTML = `
      <div class="notes-empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
        </svg>
        <p>${msg}</p>
      </div>
    `;
    }

    // ── Load and render notes into a container ──────────────────────────────
    async function load(params, container, onEditNote) {
        try {
            const qs = new URLSearchParams(params).toString();
            const data = await API.get(`/api/notes?${qs}`);
            const notes = data.notes || [];
            container.innerHTML = '';
            if (!notes.length) { renderEmpty(container); return notes; }
            notes.forEach(note => {
                container.appendChild(createCard(note, (n) => openEdit(n, params, container, onEditNote)));
            });
            return notes;
        } catch { renderEmpty(container, window.t ? t('toast.errorLoad') : 'Fehler beim Laden'); return []; }
    }

    // ── Open editor for edit ─────────────────────────────────────────────────
    function openEdit(note, listParams, container, onEditNote) {
        Editor.open(
            note,
            async ({ title, content, prefix }) => {
                try {
                    await API.put(`/api/notes/${note.id}`, { title, content, prefix });
                    toast(window.t ? t('toast.saved') : 'Gespeichert');
                    load(listParams, container, onEditNote);
                    if (onEditNote) onEditNote();
                } catch (err) { toast(window.t ? t('toast.errorPrefix', { message: err.message }) : 'Fehler: ' + err.message); }
            },
            async () => {
                try {
                    await API.delete(`/api/notes/${note.id}`);
                    toast(window.t ? t('toast.noteDeleted') : 'Notiz gelöscht');
                    load(listParams, container, onEditNote);
                    if (onEditNote) onEditNote();
                } catch (err) { toast(window.t ? t('toast.errorPrefix', { message: err.message }) : 'Fehler: ' + err.message); }
            }
        );
    }

    // ── Open editor for new note ─────────────────────────────────────────────
    function openNew(defaults, listParams, container, onEditNote) {
        Editor.open(
            null,
            async ({ title, content, prefix }) => {
                try {
                    await API.post('/api/notes', { title, content, prefix, ...defaults });
                    toast(window.t ? t('toast.noteCreated') : 'Notiz erstellt');
                    load(listParams, container, onEditNote);
                    if (onEditNote) onEditNote();
                } catch (err) { toast(window.t ? t('toast.errorPrefix', { message: err.message }) : 'Fehler: ' + err.message); }
            },
            null
        );
    }

    return { load, openNew, openEdit, stripHtml };
})();
