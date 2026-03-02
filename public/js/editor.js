/* editor.js – Rich text note editor modal */
window.Editor = (function () {
    let currentNote = null;
    let currentPrefix = null;
    let saveCallback = null;
    let deleteCallback = null;

    const modal = document.getElementById('note-editor-modal');
    const titleEl = document.getElementById('editor-title');
    const bodyEl = document.getElementById('editor-body');
    const tsEl = document.getElementById('editor-timestamp');

    // ── Standard toolbar buttons ────────────────────────────────────────────
    document.querySelectorAll('.toolbar-btn[data-cmd]').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const cmd = btn.dataset.cmd;
            if (['h1', 'h2', 'h3'].includes(cmd)) {
                document.execCommand('formatBlock', false, cmd);
            } else {
                document.execCommand(cmd, false, null);
            }
            updateToolbarState();
        });
    });

    bodyEl.addEventListener('keyup', updateToolbarState);
    bodyEl.addEventListener('mouseup', updateToolbarState);

    function updateToolbarState() {
        document.querySelectorAll('.toolbar-btn[data-cmd]').forEach(btn => {
            const cmd = btn.dataset.cmd;
            if (['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].includes(cmd)) {
                btn.classList.toggle('active', document.queryCommandState(cmd));
            }
        });
    }

    // ── Image insert ─────────────────────────────────────────────────────────
    document.getElementById('tb-image').addEventListener('mousedown', (e) => {
        e.preventDefault();
        const url = prompt(window.t ? t('editor.imagePrompt') : 'Bild-URL eingeben:');
        if (!url) return;
        bodyEl.focus();
        const html = `<figure class="note-figure"><img src="${escUrl(url)}" alt="" style="max-width:100%;border-radius:10px;display:block;"></figure><p><br></p>`;
        document.execCommand('insertHTML', false, html);
    });

    // ── YouTube embed ─────────────────────────────────────────────────────────
    document.getElementById('tb-youtube').addEventListener('mousedown', (e) => {
        e.preventDefault();
        const url = prompt(window.t ? t('editor.youtubePrompt') : 'YouTube-URL eingeben:');
        if (!url) return;
        const match = url.match(/(?:v=|youtu\.be\/)([\w-]+)/);
        if (!match) { toast(window.t ? t('toast.invalidYoutube') : 'Keine gültige YouTube-URL'); return; }
        const id = match[1];
        bodyEl.focus();
        const html = `<div class="yt-wrapper" contenteditable="false"><iframe class="yt-iframe" src="https://www.youtube-nocookie.com/embed/${id}" title="YouTube video" allowfullscreen></iframe></div><p><br></p>`;
        document.execCommand('insertHTML', false, html);
    });

    function escUrl(url) {
        return url.replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E');
    }

    // ── Prefix selector ───────────────────────────────────────────────────────
    document.querySelectorAll('.prefix-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.prefix-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPrefix = btn.dataset.prefix || null;
        });
    });

    function setPrefix(prefix) {
        currentPrefix = prefix || null;
        document.querySelectorAll('.prefix-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.prefix === (prefix || ''));
        });
    }

    // ── Open / close ──────────────────────────────────────────────────────────
    function open(note, onSave, onDelete) {
        currentNote = note || null;
        saveCallback = onSave;
        deleteCallback = onDelete;

        titleEl.value = note?.title || '';
        bodyEl.innerHTML = note?.content || '';
        setPrefix(note?.prefix || '');

        if (note?.updated_at) {
            const d = new Date(note.updated_at + 'Z');
            const lang = window.getLang ? getLang() : 'de';
            const localeMap = { de: 'de-DE', en: 'en-US', fr: 'fr-FR', es: 'es-ES', nl: 'nl-NL' };
            const dateStr = d.toLocaleString(localeMap[lang] || 'de-DE', { dateStyle: 'medium', timeStyle: 'short' });
            tsEl.textContent = window.t ? t('editor.lastEdited', { date: dateStr }) : ('Zuletzt geändert ' + dateStr);
        } else {
            tsEl.textContent = window.t ? t('editor.newNote') : 'Neue Notiz';
        }

        document.getElementById('btn-delete-note').style.display = note ? '' : 'none';

        // Zoom-in animation
        modal.classList.remove('hidden');
        const card = modal.querySelector('.modal-card');
        card.style.animation = 'none';
        card.offsetHeight; // reflow
        card.style.animation = '';

        setTimeout(() => titleEl.focus(), 80);
        updateToolbarState();
    }

    function close() {
        // Zoom-out animation
        const card = modal.querySelector('.modal-card');
        card.style.animation = 'zoomOut 0.18s cubic-bezier(0.4,0,1,1) forwards';
        setTimeout(() => {
            modal.classList.add('hidden');
            card.style.animation = '';
            currentNote = null; saveCallback = null; deleteCallback = null;
        }, 180);
    }

    // ── Save ──────────────────────────────────────────────────────────────────
    document.getElementById('btn-save-note').addEventListener('click', async () => {
        const title = titleEl.value.trim() || (window.t ? t('editor.untitled') : 'Untitled');
        const content = bodyEl.innerHTML;
        if (saveCallback) await saveCallback({ title, content, prefix: currentPrefix || null });
        close();
    });

    // ── Delete ────────────────────────────────────────────────────────────────
    document.getElementById('btn-delete-note').addEventListener('click', async () => {
        if (!confirm(window.t ? t('toast.confirmDelete') : 'Notiz wirklich löschen?')) return;
        if (deleteCallback) await deleteCallback();
        close();
    });

    // ── Close ─────────────────────────────────────────────────────────────────
    document.getElementById('btn-close-editor').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
    });

    return { open, close };
})();
