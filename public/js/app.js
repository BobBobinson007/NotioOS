/* app.js – Main router, state, theme animation, welcome modal */
window.App = (function () {
    let currentUser = null;
    let currentWorkspace = null;
    let inboxFilter = '';
    let wsFilter = '';
    let archiveFilter = '';
    const STYLE_THEMES = ['classic', 'forest', 'sunset'];
    const LOGO_STYLES = ['lines', 'orbit', 'leaf'];
    const PREF_THEME = 'notieos-theme';
    const PREF_STYLE = 'notieos-style';
    const PREF_LOGO = 'notieos-logo';

    function getPref(key, fallback, userId = null) {
        const uid = userId || currentUser?.id;
        if (uid) {
            const userKey = `${key}:${uid}`;
            const val = localStorage.getItem(userKey);
            if (val) return val;
            const globalVal = localStorage.getItem(key);
            if (globalVal) {
                localStorage.setItem(userKey, globalVal);
                return globalVal;
            }
        }
        return localStorage.getItem(key) || fallback;
    }

    function setPref(key, value) {
        const uid = currentUser?.id;
        if (uid) localStorage.setItem(`${key}:${uid}`, value);
        else localStorage.setItem(key, value);
    }

    // ── Bootstrap ──────────────────────────────────────────────────────────
    async function init() {
        const savedTheme = getPref(PREF_THEME, 'dark');
        setTheme(savedTheme, false);

        const savedStyle = getPref(PREF_STYLE, 'classic');
        applyStyleTheme(savedStyle, false);

        const savedLogo = getPref(PREF_LOGO, 'lines');
        applyLogoStyle(savedLogo, false);

        try {
            const data = await API.get('/api/auth/me');
            onLogin(data.user, false);
        } catch {
            showAuth();
        }
    }

    // ── Auth state ─────────────────────────────────────────────────────────
    function showAuth() {
        document.getElementById('auth-shell').classList.remove('hidden');
        document.getElementById('app-shell').classList.add('hidden');
        Auth.showAuthView('view-login');
    }

    async function onLogin(user, isNewUser) {
        currentUser = user;
        document.getElementById('auth-shell').classList.add('hidden');
        document.getElementById('app-shell').classList.remove('hidden');

        applyUserPreferences(user);
        updateUserUI(user);
        await Workspaces.load();
        showView('inbox');

        // Show welcome modal for new users
        if (isNewUser) {
            setTimeout(() => showWelcomeModal(user), 400);
        }
    }

    function onLogout() {
        currentUser = null;
        currentWorkspace = null;
        document.body.classList.remove('sidebar-open');
        showAuth();
    }

    // ── User UI updates ────────────────────────────────────────────────────
    function updateUserUI(user) {
        document.getElementById('user-name-label').textContent = user.name;
        updateAvatarUI(user.avatar);

        const sn = document.getElementById('settings-name');
        const se = document.getElementById('settings-email');
        if (sn) sn.textContent = user.name;
        if (se) se.textContent = user.email;

        updateTotpSettingsUI(user.totp_enabled, user.email_2fa_enabled);
        if (window.AvatarUI) window.AvatarUI.renderPicker('avatar-style-grid', user.avatar);
    }

    function updateAvatarUI(avatar) {
        const chip = document.getElementById('user-avatar');
        const settAv = document.getElementById('settings-avatar');
        const initials = currentUser ? currentUser.name.charAt(0).toUpperCase() : '?';

        [chip, settAv].forEach(el => {
            if (!el) return;
            el.classList.remove('avatar-icon');
            el.removeAttribute('data-avatar-preset');
            el.style.color = '';
            if (avatar && avatar.startsWith('preset:') && window.AvatarUI?.applyAvatar(el, avatar)) return;
            if (avatar && avatar.startsWith('data:')) {
                el.style.background = 'none';
                el.style.color = '';
                el.textContent = '';
                el.innerHTML = `<img src="${avatar}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            } else if (avatar && avatar.startsWith('linear-gradient')) {
                el.style.background = avatar;
                el.style.color = '#fff';
                el.textContent = initials;
                el.innerHTML = initials;
            } else {
                el.style.background = 'var(--accent)';
                el.style.color = '#fff';
                el.textContent = initials;
                el.innerHTML = initials;
            }
        });
    }

    function updateTotpSettingsUI(totpEnabled, emailEnabled) {
        const areas = {
            disabled: document.getElementById('totp-disabled-area'),
            setup: document.getElementById('totp-setup-area'),
            enabled: document.getElementById('totp-enabled-area'),
        };
        if (!areas.disabled) return;

        if (totpEnabled) {
            areas.disabled.classList.add('hidden');
            areas.setup.classList.add('hidden');
            areas.enabled.classList.remove('hidden');
        } else {
            areas.disabled.classList.remove('hidden');
            areas.setup.classList.add('hidden');
            areas.enabled.classList.add('hidden');
        }

        // Email 2FA
        const statusEl = document.getElementById('email-2fa-status');
        const toggleBtn = document.getElementById('btn-toggle-email-2fa');
        if (statusEl) {
            statusEl.textContent = emailEnabled
                ? (window.t ? t('settings.email2fa.active') : 'Aktiv')
                : (window.t ? t('settings.email2fa.inactive') : 'Inaktiv');
        }
        if (toggleBtn) {
            toggleBtn.textContent = emailEnabled
                ? (window.t ? t('settings.email2fa.disable') : 'Deaktivieren')
                : (window.t ? t('settings.email2fa.enable') : 'Aktivieren');
        }
    }

    function applyStyleTheme(style, persist = true) {
        const normalized = STYLE_THEMES.includes(style) ? style : 'classic';
        document.documentElement.setAttribute('data-style', normalized);
        if (persist) setPref(PREF_STYLE, normalized);
        updateStyleThemeUI(normalized);
        updateFavicon(normalized);
    }

    function updateStyleThemeUI(activeStyle) {
        document.querySelectorAll('.theme-card').forEach(card => {
            card.classList.toggle('selected', card.dataset.style === activeStyle);
        });
        document.querySelectorAll('.welcome-theme-chip').forEach(chip => {
            const active = chip.dataset.style === activeStyle;
            chip.classList.toggle('selected', active);
            chip.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function updateFavicon(style) {
        const map = {
            classic: '/favicon-classic.svg',
            forest: '/favicon-forest.svg',
            sunset: '/favicon-sunset.svg',
        };
        const el = document.getElementById('favicon');
        if (el) el.setAttribute('href', map[style] || map.classic);
    }

    function applyLogoStyle(style, persist = true) {
        const normalized = LOGO_STYLES.includes(style) ? style : 'lines';
        document.documentElement.setAttribute('data-logo', normalized);
        if (persist) setPref(PREF_LOGO, normalized);
        updateLogoStyleUI(normalized);
    }

    function setTheme(theme, persist = true) {
        const normalized = theme === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', normalized);
        if (persist) setPref(PREF_THEME, normalized);
        updateThemeIcons(normalized);
    }

    function applyUserPreferences(user) {
        if (!user?.id) return;
        const theme = getPref(PREF_THEME, 'dark', user.id);
        const style = getPref(PREF_STYLE, 'classic', user.id);
        const logo = getPref(PREF_LOGO, 'lines', user.id);
        setTheme(theme, true);
        applyStyleTheme(style, true);
        applyLogoStyle(logo, true);
    }

    function updateLogoStyleUI(activeLogo) {
        document.querySelectorAll('.logo-style-chip').forEach(chip => {
            const active = chip.dataset.logo === activeLogo;
            chip.classList.toggle('selected', active);
            chip.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    // ── Welcome Tutorial ──────────────────────────────────────────────────
    let tutorialStep = 1;
    const TOTAL_STEPS = 5;

    function showWelcomeModal(user) {
        const modal = document.getElementById('welcome-modal');
        if (!modal) return;
        const titleEl = document.getElementById('welcome-title');
        const firstName = user.name.split(' ')[0];
        if (titleEl) {
            titleEl.textContent = window.t
                ? `${t('welcome.title', { name: firstName })}`
                : `Hallo, ${firstName}!`;
        }
        tutorialStep = 1;
        updateTutorialUI();
        bindWelcomeHero();
        modal.classList.remove('hidden');
    }

    function updateTutorialUI() {
        const slides = document.querySelectorAll('.tutorial-slide');
        const dots = document.querySelectorAll('.dot');
        const backBtn = document.getElementById('btn-tutorial-back');
        const nextBtn = document.getElementById('btn-tutorial-next');
        const finishBtn = document.getElementById('btn-tutorial-finish');

        slides.forEach((slide, i) => {
            const step = i + 1;
            slide.classList.toggle('active', step === tutorialStep);
            slide.classList.toggle('past', step < tutorialStep);
        });

        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i + 1 === tutorialStep);
        });

        if (backBtn) backBtn.classList.toggle('hidden', tutorialStep === 1);
        if (nextBtn) nextBtn.classList.toggle('hidden', tutorialStep === TOTAL_STEPS);
        if (finishBtn) finishBtn.classList.toggle('hidden', tutorialStep !== TOTAL_STEPS);
    }

    function bindWelcomeHero() {
        const hero = document.getElementById('welcome-hero');
        if (!hero || hero.dataset.bound) return;
        hero.dataset.bound = '1';
        hero.addEventListener('mousemove', (e) => {
            const rect = hero.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width - 0.5;
            const y = (e.clientY - rect.top) / rect.height - 0.5;
            hero.style.setProperty('--rx', `${(-y * 6).toFixed(2)}deg`);
            hero.style.setProperty('--ry', `${(x * 6).toFixed(2)}deg`);
        });
        hero.addEventListener('mouseleave', () => {
            hero.style.setProperty('--rx', '0deg');
            hero.style.setProperty('--ry', '0deg');
        });
    }

    document.addEventListener('click', (e) => {
        const themeChip = e.target.closest('.welcome-theme-chip');
        if (themeChip) {
            applyStyleTheme(themeChip.dataset.style);
            return;
        }
        const logoChip = e.target.closest('.logo-style-chip');
        if (logoChip) {
            applyLogoStyle(logoChip.dataset.logo);
            return;
        }

        if (e.target.id === 'btn-tutorial-next') {
            if (tutorialStep < TOTAL_STEPS) {
                tutorialStep++;
                updateTutorialUI();
            }
            return;
        }
        if (e.target.id === 'btn-tutorial-back') {
            if (tutorialStep > 1) {
                tutorialStep--;
                updateTutorialUI();
            }
            return;
        }
        if (e.target.id === 'btn-tutorial-finish' || e.target.id === 'welcome-modal') {
            const modal = document.getElementById('welcome-modal');
            if (modal) {
                modal.style.animation = 'fadeOut 0.25s ease forwards';
                setTimeout(() => { modal.classList.add('hidden'); modal.style.animation = ''; }, 250);
            }
        }
    });

    // ── View routing ───────────────────────────────────────────────────────
    const views = ['inbox', 'sort', 'workspace', 'archive', 'settings'];
    const MOBILE_BREAKPOINT = 900;

    function closeSidebarIfMobile() {
        if (window.innerWidth <= MOBILE_BREAKPOINT) {
            document.body.classList.remove('sidebar-open');
        }
    }

    function showView(name) {
        views.forEach(v => {
            const el = document.getElementById(`view-${v}`);
            if (el) el.classList.toggle('hidden', v !== name);
        });

        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        const navEl = document.getElementById(`nav-${name}`);
        if (navEl) navEl.classList.add('active');

        if (name === 'inbox') loadInbox();
        if (name === 'sort') Sorting.load();
        if (name === 'archive') loadArchive();
        if (name === 'settings') { updateTotpSettingsUI(currentUser?.totp_enabled, currentUser?.email_2fa_enabled); }
        closeSidebarIfMobile();
    }

    // ── Inbox ──────────────────────────────────────────────────────────────
    async function loadInbox() {
        const container = document.getElementById('inbox-notes');
        const params = { location: 'inbox' };
        if (inboxFilter) params.prefix = inboxFilter;
        await Notes.load(params, container, () => updateInboxBadge());
        await updateInboxBadge();
    }

    async function updateInboxBadge() {
        try {
            const data = await API.get('/api/notes?location=inbox');
            const count = (data.notes || []).length;
            const badge = document.getElementById('inbox-badge');
            badge.textContent = count > 0 ? count : '';
        } catch { }
    }

    document.getElementById('btn-new-note-inbox').addEventListener('click', () => {
        Notes.openNew({ location: 'inbox' }, { location: 'inbox' }, document.getElementById('inbox-notes'), () => updateInboxBadge());
    });

    document.getElementById('inbox-filters').addEventListener('click', (e) => {
        const pill = e.target.closest('.pill');
        if (!pill) return;
        document.querySelectorAll('#inbox-filters .pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        inboxFilter = pill.dataset.filter;
        loadInbox();
    });

    // ── Workspace ─────────────────────────────────────────────────────────
    function openWorkspace(ws) {
        currentWorkspace = ws;
        document.getElementById('workspace-title').textContent = ws.name;
        const allWs = Workspaces.getAll();
        let sub = '';
        if (ws.parent_id) {
            const parent = allWs.find(w => w.id === ws.parent_id);
            if (parent) sub = parent.name + ' › ';
        }
        document.getElementById('workspace-sub').textContent = sub + ws.name;
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        const wsBtn = document.querySelector(`.nav-item[data-ws-id="${ws.id}"]`);
        if (wsBtn) wsBtn.classList.add('active');
        showView('workspace');
        loadWorkspaceNotes();
    }

    async function loadWorkspaceNotes() {
        if (!currentWorkspace) return;
        const container = document.getElementById('ws-notes');
        const params = { location: 'workspace', workspace_id: currentWorkspace.id };
        if (wsFilter) params.prefix = wsFilter;
        await Notes.load(params, container, null);
    }

    document.getElementById('btn-new-note-ws').addEventListener('click', () => {
        if (!currentWorkspace) return;
        Notes.openNew(
            { location: 'workspace', workspace_id: currentWorkspace.id },
            { location: 'workspace', workspace_id: currentWorkspace.id },
            document.getElementById('ws-notes'), null
        );
    });

    const deleteWorkspaceBtn = document.getElementById('btn-delete-workspace');
    if (deleteWorkspaceBtn) {
        deleteWorkspaceBtn.addEventListener('click', async () => {
            if (!currentWorkspace) return;
            const msg = window.t
                ? t('workspace.deleteConfirm', { name: currentWorkspace.name })
                : `Workspace \"${currentWorkspace.name}\" löschen?`;
            if (!confirm(msg)) return;
            try {
                await API.delete(`/api/workspaces/${currentWorkspace.id}`);
                toast(window.t ? t('toast.workspaceDeleted') : 'Workspace gelöscht');
                currentWorkspace = null;
                await Workspaces.load();
                showView('inbox');
            } catch (err) {
                toast(window.t ? t('toast.errorPrefix', { message: err.message }) : 'Fehler: ' + err.message);
            }
        });
    }

    document.getElementById('ws-filters').addEventListener('click', (e) => {
        const pill = e.target.closest('.pill');
        if (!pill) return;
        document.querySelectorAll('#ws-filters .pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        wsFilter = pill.dataset.filter;
        loadWorkspaceNotes();
    });

    // ── Archive ────────────────────────────────────────────────────────────
    async function loadArchive() {
        const container = document.getElementById('archive-notes');
        const params = { location: 'archive' };
        if (archiveFilter) params.prefix = archiveFilter;
        await Notes.load(params, container, null);
    }

    document.getElementById('archive-filters').addEventListener('click', (e) => {
        const pill = e.target.closest('.pill');
        if (!pill) return;
        document.querySelectorAll('#archive-filters .pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        archiveFilter = pill.dataset.filter;
        loadArchive();
    });

    // ── Nav clicks ─────────────────────────────────────────────────────────
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
        btn.addEventListener('click', () => showView(btn.dataset.view));
    });

    const sidebarToggle = document.getElementById('btn-sidebar-toggle');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');

    function toggleSidebar() {
        if (window.innerWidth > MOBILE_BREAKPOINT) return;
        document.body.classList.toggle('sidebar-open');
    }

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }
    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
    }
    window.addEventListener('resize', () => {
        if (window.innerWidth > MOBILE_BREAKPOINT) {
            document.body.classList.remove('sidebar-open');
        }
    });

    // ── Theme Toggle with View Transitions ─────────────────────────────────
    document.getElementById('btn-theme-toggle').addEventListener('click', async (e) => {
        const html = document.documentElement;
        const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';

        const btn = e.currentTarget;
        const rect = btn.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const maxR = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

        const apply = () => {
            setTheme(next, true);
        };

        if (!document.startViewTransition) { apply(); return; }

        const transition = document.startViewTransition(apply);
        await transition.ready;

        document.documentElement.animate(
            { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxR}px at ${x}px ${y}px)`] },
            { duration: 500, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)' }
        );
    });

    const styleGrid = document.getElementById('style-theme-grid');
    if (styleGrid) {
        styleGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.theme-card');
            if (!card) return;
            applyStyleTheme(card.dataset.style);
        });
    }

    window.addEventListener('i18n:change', () => {
        if (currentWorkspace) {
            document.getElementById('workspace-title').textContent = currentWorkspace.name;
            const allWs = Workspaces.getAll();
            let sub = '';
            if (currentWorkspace.parent_id) {
                const parent = allWs.find(w => w.id === currentWorkspace.parent_id);
                if (parent) sub = parent.name + ' › ';
            }
            document.getElementById('workspace-sub').textContent = sub + currentWorkspace.name;
        }
        if (currentUser) updateAvatarUI(currentUser.avatar);
        updateTotpSettingsUI(currentUser?.totp_enabled, currentUser?.email_2fa_enabled);
    });

    function updateThemeIcons(theme) {
        document.getElementById('icon-sun').classList.toggle('hidden', theme === 'light');
        document.getElementById('icon-moon').classList.toggle('hidden', theme === 'dark');
    }

    // ── PWA ───────────────────────────────────────────────────────────────
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').catch(() => { });
        });
    }

    // ── Start ──────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', init);

    return {
        onLogin, onLogout, showView, openWorkspace, updateInboxBadge, updateAvatarUI,
        get currentUser() { return currentUser; }
    };
})();
