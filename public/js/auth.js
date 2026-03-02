/* auth.js – Registration, Login, 2FA flows (TOTP + Email OTP) */
(function () {
    let preToken = null;
    let twoFaMethod = 'totp'; // 'totp' | 'email'
    let selectedAvatar = null;

    function storeToken(token) {
        if (!token) return;
        sessionStorage.setItem('notieos-token', token);
    }

    function getDefaultAvatar() {
        const presets = window.AvatarUI?.PRESETS || [];
        return presets.length ? `preset:${presets[0].id}` : null;
    }

    // ── Avatar picker rendering on register form ─────────────────────────────
    function renderAvatarPicker() {
        const picker = document.getElementById('avatar-picker');
        if (!picker || !window.AvatarUI) return;
        if (!selectedAvatar) selectedAvatar = getDefaultAvatar();
        window.AuthSelectedAvatar = selectedAvatar;
        window.AvatarUI.renderPicker('avatar-picker', selectedAvatar);
    }

    // ── View switching ──────────────────────────────────────────────────────
    function showAuthView(id) {
        ['view-register', 'view-login', 'view-2fa-verify'].forEach(v => {
            document.getElementById(v).classList.add('hidden');
        });
        document.getElementById(id).classList.remove('hidden');
        if (id === 'view-register') renderAvatarPicker();
    }

    const avatarPickerEl = document.getElementById('avatar-picker');
    if (avatarPickerEl) {
        avatarPickerEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.avatar-style-btn');
            if (!btn) return;
            selectedAvatar = btn.dataset.avatar;
            window.AuthSelectedAvatar = selectedAvatar;
            window.AvatarUI?.setSelected('avatar-picker', selectedAvatar);
        });
    }

    const avatarStyleGrid = document.getElementById('avatar-style-grid');
    if (avatarStyleGrid) {
        avatarStyleGrid.addEventListener('click', async (e) => {
            const btn = e.target.closest('.avatar-style-btn');
            if (!btn) return;
            const avatar = btn.dataset.avatar;
            try {
                await API.post('/api/auth/avatar', { avatar });
                if (window.App.currentUser) window.App.currentUser.avatar = avatar;
                window.App.updateAvatarUI(avatar);
                window.AvatarUI?.setSelected('avatar-style-grid', avatar);
                toast(window.t ? t('toast.avatarUpdated') : 'Profilbild aktualisiert');
            } catch (err) {
                toast(window.t ? t('toast.errorPrefix', { message: err.message }) : 'Fehler: ' + err.message);
            }
        });
    }

    document.getElementById('go-login').addEventListener('click', e => { e.preventDefault(); showAuthView('view-login'); });
    document.getElementById('go-register').addEventListener('click', e => { e.preventDefault(); showAuthView('view-register'); });
    document.getElementById('cancel-2fa').addEventListener('click', e => { e.preventDefault(); preToken = null; showAuthView('view-login'); });

    // ── Register ──────────────────────────────────────────────────────────────
    document.getElementById('form-register').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('reg-error');
        errEl.classList.add('hidden');
        const btn = document.getElementById('btn-register');
        btn.textContent = window.t ? t('auth.register.loading') : 'Wird erstellt…'; btn.disabled = true;
        try {
            const data = await API.post('/api/auth/register', {
                name: document.getElementById('reg-name').value.trim(),
                email: document.getElementById('reg-email').value.trim(),
                password: document.getElementById('reg-password').value,
            });

            // Update avatar to selected one
            if (selectedAvatar) {
                await API.post('/api/auth/avatar', { avatar: selectedAvatar }).catch(() => { });
            }

            storeToken(data.token);
            window.App.onLogin(data.user, true); // true = first login → show welcome
        } catch (err) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
        } finally {
            btn.textContent = window.t ? t('auth.register.button') : 'Konto erstellen'; btn.disabled = false;
        }
    });

    // ── Login ─────────────────────────────────────────────────────────────────
    document.getElementById('form-login').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('login-error');
        errEl.classList.add('hidden');
        const btn = document.getElementById('btn-login');
        btn.textContent = window.t ? t('auth.login.loading') : 'Anmelden…'; btn.disabled = true;
        try {
            const data = await API.post('/api/auth/login', {
                email: document.getElementById('login-email').value.trim(),
                password: document.getElementById('login-password').value,
            });
            if (data.totp_required) {
                preToken = data.pre_token;
                twoFaMethod = data.method || 'totp';

                const sub = document.getElementById('2fa-verify-sub');
                if (twoFaMethod === 'email') {
                    if (sub) sub.textContent = window.t ? t('auth.2fa.emailSend') : 'Wir senden dir einen Code per E-Mail.';
                    // Auto-send email OTP
                    await API.post('/api/auth/2fa/email/send-login', { pre_token: preToken });
                    if (sub) sub.textContent = window.t ? t('auth.2fa.emailSent') : 'Code wurde gesendet. Gib ihn unten ein.';
                } else {
                    if (sub) sub.textContent = window.t ? t('auth.2fa.totpPrompt') : 'Gib den Code aus deiner Authenticator-App ein.';
                }

                document.getElementById('2fa-method-label').textContent = twoFaMethod === 'email'
                    ? (window.t ? t('auth.2fa.emailLabel') : 'E-Mail-Code')
                    : (window.t ? t('auth.2fa.totpLabel') : 'Authenticator-Code');
                showAuthView('view-2fa-verify');
            } else {
                storeToken(data.token);
                window.App.onLogin(data.user, false);
            }
        } catch (err) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
        } finally {
            btn.textContent = window.t ? t('auth.login.button') : 'Anmelden'; btn.disabled = false;
        }
    });

    // ── 2FA Verify (login) ────────────────────────────────────────────────────
    document.getElementById('form-2fa-verify').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = document.getElementById('totp-verify-error');
        errEl.classList.add('hidden');
        const code = document.getElementById('totp-verify-code').value.trim();
        try {
            let data;
            if (twoFaMethod === 'email') {
                data = await API.post('/api/auth/2fa/email/verify-login', { pre_token: preToken, otp: code });
            } else {
                data = await API.post('/api/auth/2fa/verify', { pre_token: preToken, token: code });
            }
            preToken = null;
            storeToken(data.token);
            window.App.onLogin(data.user, false);
        } catch (err) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
        }
    });

    // ── Settings: TOTP 2FA setup ──────────────────────────────────────────────
    document.getElementById('btn-setup-2fa').addEventListener('click', async () => {
        try {
            const data = await API.post('/api/auth/2fa/setup', {});
            document.getElementById('qr-img').src = data.qr;
            document.getElementById('totp-secret-key').textContent = data.secret;
            document.getElementById('totp-disabled-area').classList.add('hidden');
            document.getElementById('totp-setup-area').classList.remove('hidden');
        } catch (err) { toast(window.t ? t('toast.errorPrefix', { message: err.message }) : 'Fehler: ' + err.message); }
    });

    document.getElementById('btn-cancel-2fa-setup').addEventListener('click', () => {
        document.getElementById('totp-setup-area').classList.add('hidden');
        document.getElementById('totp-disabled-area').classList.remove('hidden');
    });

    document.getElementById('btn-enable-2fa').addEventListener('click', async () => {
        const errEl = document.getElementById('totp-enable-error');
        errEl.classList.add('hidden');
        const code = document.getElementById('totp-enable-code').value.trim();
        try {
            await API.post('/api/auth/2fa/enable', { token: code });
            document.getElementById('totp-setup-area').classList.add('hidden');
            document.getElementById('totp-enabled-area').classList.remove('hidden');
            toast(window.t ? t('toast.auth2faEnabled') : 'Authenticator-2FA aktiviert');
            if (window.App.currentUser) window.App.currentUser.totp_enabled = 1;
        } catch (err) {
            errEl.textContent = err.message;
            errEl.classList.remove('hidden');
        }
    });

    document.getElementById('btn-disable-2fa').addEventListener('click', async () => {
        if (!confirm(window.t ? t('auth.2fa.disableConfirm') : '2FA wirklich deaktivieren?')) return;
        try {
            await API.post('/api/auth/2fa/disable', {});
            document.getElementById('totp-enabled-area').classList.add('hidden');
            document.getElementById('totp-disabled-area').classList.remove('hidden');
            toast(window.t ? t('toast.auth2faDisabled') : 'Authenticator-2FA deaktiviert');
            if (window.App.currentUser) window.App.currentUser.totp_enabled = 0;
        } catch (err) { toast(window.t ? t('toast.errorPrefix', { message: err.message }) : 'Fehler: ' + err.message); }
    });

    // ── Settings: Email 2FA toggle ─────────────────────────────────────────────
    document.getElementById('btn-toggle-email-2fa').addEventListener('click', async () => {
        try {
            const data = await API.post('/api/auth/2fa/email/toggle', {});
            const enabled = !!data.email_2fa_enabled;
            document.getElementById('email-2fa-status').textContent = enabled
                ? (window.t ? t('settings.email2fa.active') : 'Aktiv')
                : (window.t ? t('settings.email2fa.inactive') : 'Inaktiv');
            document.getElementById('btn-toggle-email-2fa').textContent = enabled
                ? (window.t ? t('settings.email2fa.disable') : 'Deaktivieren')
                : (window.t ? t('settings.email2fa.enable') : 'Aktivieren');
            if (window.App.currentUser) window.App.currentUser.email_2fa_enabled = data.email_2fa_enabled;
            const state = enabled ? (window.t ? t('settings.email2fa.active') : 'aktiviert') : (window.t ? t('settings.email2fa.inactive') : 'deaktiviert');
            toast(window.t ? t('toast.email2fa', { state }) : 'E-Mail-2FA ' + (enabled ? 'aktiviert' : 'deaktiviert'));
        } catch (err) { toast(window.t ? t('toast.errorPrefix', { message: err.message }) : 'Fehler: ' + err.message); }
    });

    // ── Logout ─────────────────────────────────────────────────────────────────
    async function logout() {
        await API.post('/api/auth/logout', {}).catch(() => { });
        sessionStorage.removeItem('notieos-token');
        window.App.onLogout();
    }
    document.getElementById('btn-logout').addEventListener('click', logout);
    document.getElementById('btn-settings-logout').addEventListener('click', logout);

    // ── Expose ──────────────────────────────────────────────────────────────
    window.Auth = { showAuthView };
})();
