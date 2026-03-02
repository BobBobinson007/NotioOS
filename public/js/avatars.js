/* avatars.js – preset avatar styles */
(function () {
    const PRESETS = [
        {
            id: 'orb',
            labelKey: 'avatar.orb',
            svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="currentColor"/><circle cx="9" cy="9" r="3" fill="#fff" opacity="0.7"/></svg>'
        },
        {
            id: 'ring',
            labelKey: 'avatar.ring',
            svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>'
        },
        {
            id: 'grid',
            labelKey: 'avatar.grid',
            svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="2" fill="currentColor"/><rect x="13" y="4" width="7" height="7" rx="2" fill="currentColor" opacity="0.6"/><rect x="4" y="13" width="7" height="7" rx="2" fill="currentColor" opacity="0.6"/><rect x="13" y="13" width="7" height="7" rx="2" fill="currentColor"/></svg>'
        },
        {
            id: 'stack',
            labelKey: 'avatar.stack',
            svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="6" width="14" height="3" rx="1.5" fill="currentColor"/><rect x="5" y="11" width="14" height="3" rx="1.5" fill="currentColor" opacity="0.75"/><rect x="5" y="16" width="14" height="3" rx="1.5" fill="currentColor" opacity="0.55"/></svg>'
        },
        {
            id: 'dot',
            labelKey: 'avatar.dot',
            svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="3" fill="currentColor"/><circle cx="16" cy="12" r="3" fill="currentColor" opacity="0.5"/><rect x="5" y="6" width="14" height="12" rx="6" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
        },
    ];

    function getPreset(id) {
        return PRESETS.find(p => p.id === id);
    }

    function renderPicker(containerId, selectedValue) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        PRESETS.forEach(preset => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'avatar-style-btn' + (selectedValue === `preset:${preset.id}` ? ' selected' : '');
            btn.dataset.avatar = `preset:${preset.id}`;
            btn.setAttribute('title', window.t ? window.t(preset.labelKey) : preset.id);
            btn.setAttribute('aria-label', window.t ? window.t(preset.labelKey) : preset.id);

            const preview = document.createElement('div');
            preview.className = 'avatar-preview';
            preview.innerHTML = preset.svg;

            const name = document.createElement('div');
            name.className = 'avatar-style-name';
            name.textContent = window.t ? window.t(preset.labelKey) : preset.id;

            btn.appendChild(preview);
            btn.appendChild(name);
            container.appendChild(btn);
        });
    }

    function setSelected(containerId, selectedValue) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('.avatar-style-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.avatar === selectedValue);
        });
    }

    function applyAvatar(el, avatarValue) {
        if (!el || !avatarValue || !avatarValue.startsWith('preset:')) return false;
        const id = avatarValue.replace('preset:', '');
        const preset = getPreset(id);
        if (!preset) return false;
        el.classList.add('avatar-icon');
        el.dataset.avatarPreset = id;
        el.style.background = 'var(--surface2)';
        el.style.color = 'var(--accent)';
        el.textContent = '';
        el.innerHTML = preset.svg;
        return true;
    }

    function refreshPickers() {
        renderPicker('avatar-picker', window.AuthSelectedAvatar || null);
        renderPicker('avatar-style-grid', window.App?.currentUser?.avatar || null);
    }

    window.AvatarUI = { PRESETS, renderPicker, setSelected, applyAvatar, refreshPickers };

    window.addEventListener('i18n:change', () => {
        refreshPickers();
    });
})();
