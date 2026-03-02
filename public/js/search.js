/* search.js – Global standard search */
window.Search = (function () {
    const modal = document.getElementById('search-modal');
    if (!modal) return {};

    const standardInput = document.getElementById('search-input');
    const standardResults = document.getElementById('search-results');
    const searchClear = document.getElementById('search-clear');

    const openButtons = document.querySelectorAll('[data-open-search]');
    const closeButton = document.getElementById('search-close');

    let searchTimer = null;
    let lastQuery = '';
    let standardMap = new Map();

    function tKey(key, fallback) {
        return window.t ? t(key) : fallback;
    }

    function open() {
        modal.classList.remove('hidden');
        document.body.classList.add('search-open');
        if (standardInput) setTimeout(() => standardInput.focus(), 50);
    }

    function close() {
        modal.classList.add('hidden');
        document.body.classList.remove('search-open');
    }

    function isTypingContext() {
        const el = document.activeElement;
        if (!el) return false;
        return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str ?? '';
        return div.innerHTML;
    }

    function escapeRegExp(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function stripHtml(html) {
        if (window.Notes?.stripHtml) return Notes.stripHtml(html || '');
        const div = document.createElement('div');
        div.innerHTML = html || '';
        return div.textContent || '';
    }

    function formatDate(note) {
        const raw = note.updated_at || note.created_at;
        if (!raw) return '';
        const d = new Date(raw + 'Z');
        const lang = window.getLang ? getLang() : 'de';
        const localeMap = { de: 'de-DE', en: 'en-US', fr: 'fr-FR', es: 'es-ES', nl: 'nl-NL' };
        return d.toLocaleDateString(localeMap[lang] || 'de-DE', { day: '2-digit', month: 'short' });
    }

    function buildSnippet(text, query) {
        const clean = (text || '').replace(/\s+/g, ' ').trim();
        if (!clean) return '';
        if (!query) return clean.length > 180 ? clean.slice(0, 180) + '…' : clean;
        const lower = clean.toLowerCase();
        const q = query.toLowerCase();
        const idx = lower.indexOf(q);
        if (idx === -1) return clean.length > 180 ? clean.slice(0, 180) + '…' : clean;
        const start = Math.max(0, idx - 60);
        const end = Math.min(clean.length, idx + 120);
        let snippet = clean.slice(start, end);
        if (start > 0) snippet = '…' + snippet;
        if (end < clean.length) snippet += '…';
        return snippet;
    }

    function highlight(text, query) {
        const safe = escapeHtml(text || '');
        if (!query) return safe;
        try {
            const re = new RegExp(`(${escapeRegExp(query)})`, 'ig');
            return safe.replace(re, '<mark>$1</mark>');
        } catch {
            return safe;
        }
    }

    function renderEmpty(container, message) {
        container.innerHTML = `<div class="search-empty">${escapeHtml(message)}</div>`;
    }

    function renderLoading(container, message) {
        container.innerHTML = `<div class="search-loading">${escapeHtml(message)}</div>`;
    }

    function renderResults(container, notes, query, mapTarget) {
        if (!notes.length) {
            renderEmpty(container, tKey('search.empty', 'Keine Treffer'));
            return;
        }
        mapTarget.clear();
        container.innerHTML = notes.map(note => {
            mapTarget.set(String(note.id), note);
            const title = highlight(note.title || '', query);
            const plain = stripHtml(note.content || '');
            const snippet = highlight(buildSnippet(plain, query), query);
            const metaParts = [];
            if (note.prefix) metaParts.push(`<span class="note-card-prefix ${escapeHtml(note.prefix)}">${escapeHtml(note.prefix)}</span>`);
            if (note.location) metaParts.push(escapeHtml(note.location));
            const date = formatDate(note);
            if (date) metaParts.push(date);
            const metaHtml = metaParts.length
                ? `<div class="search-result-meta">${metaParts.join('<span class="dot"></span>')}</div>`
                : '';
            return `
        <div class="search-result" data-id="${escapeHtml(String(note.id))}">
          ${metaHtml}
          <div class="search-result-title">${title}</div>
          ${snippet ? `<div class="search-result-snippet">${snippet}</div>` : ''}
        </div>`;
        }).join('');
    }

    async function runStandardSearch(query) {
        lastQuery = query;
        if (!query) {
            renderEmpty(standardResults, tKey('search.idle', 'Tippe, um zu suchen'));
            return;
        }
        renderLoading(standardResults, tKey('search.loading', 'Suche…'));
        try {
            const data = await API.get(`/api/notes?search=${encodeURIComponent(query)}`);
            const notes = (data.notes || []).slice(0, 40);
            renderResults(standardResults, notes, query, standardMap);
        } catch (err) {
            renderEmpty(standardResults, err.message || tKey('toast.errorPrefix', 'Fehler'));
        }
    }

    function scheduleStandardSearch() {
        const q = standardInput.value.trim();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => runStandardSearch(q), 200);
    }

    async function openNoteFromMap(id, mapRef) {
        let note = mapRef.get(String(id));
        if (!note || !note.content) {
            try {
                const data = await API.get(`/api/notes/${id}`);
                note = data.note;
            } catch (err) {
                toast(err.message || tKey('toast.errorPrefix', 'Fehler'));
                return;
            }
        }
        if (!note) return;
        Editor.open(
            note,
            async ({ title, content, prefix }) => {
                await API.put(`/api/notes/${note.id}`, { title, content, prefix });
                toast(tKey('toast.saved', 'Gespeichert'));
                if (lastQuery) runStandardSearch(lastQuery);
            },
            async () => {
                await API.delete(`/api/notes/${note.id}`);
                toast(tKey('toast.noteDeleted', 'Notiz gelöscht'));
                if (lastQuery) runStandardSearch(lastQuery);
            }
        );
    }

    openButtons.forEach(btn => btn.addEventListener('click', open));
    if (closeButton) closeButton.addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    standardInput.addEventListener('input', scheduleStandardSearch);
    standardInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') runStandardSearch(standardInput.value.trim());
        if (e.key === 'Escape') close();
    });

    if (searchClear) {
        searchClear.addEventListener('click', () => {
            standardInput.value = '';
            lastQuery = '';
            renderEmpty(standardResults, tKey('search.idle', 'Tippe, um zu suchen'));
            standardInput.focus();
        });
    }

    standardResults.addEventListener('click', (e) => {
        const card = e.target.closest('.search-result');
        if (!card) return;
        openNoteFromMap(card.dataset.id, standardMap);
    });

    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            open();
        }
        if (e.key === '/' && !isTypingContext()) {
            e.preventDefault();
            open();
        }
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            close();
        }
    });

    renderEmpty(standardResults, tKey('search.idle', 'Tippe, um zu suchen'));

    return { open, close };
})();
