const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const db = require('../db/database');
const crypto = require('crypto');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_PASS;

function createTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: { user: GMAIL_USER, pass: GMAIL_PASS }
    });
}

// ── Register ──────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password)
            return res.status(400).json({ error: 'All fields are required.' });

        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing)
            return res.status(409).json({ error: 'Email already registered.' });

        const hash = await bcrypt.hash(password, 12);
        const result = db.prepare(
            'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)'
        ).run(name, email.toLowerCase().trim(), hash);

        const userId = result.lastInsertRowid;

        // Create default workspace
        db.prepare('INSERT INTO workspaces (user_id, name) VALUES (?, ?)').run(userId, 'Personal');

        // Assign random gradient avatar
        const GRADIENTS = [
            'linear-gradient(135deg,#667eea,#764ba2)',
            'linear-gradient(135deg,#f093fb,#f5576c)',
            'linear-gradient(135deg,#4facfe,#00f2fe)',
            'linear-gradient(135deg,#43e97b,#38f9d7)',
            'linear-gradient(135deg,#fa709a,#fee140)',
            'linear-gradient(135deg,#a18cd1,#fbc2eb)',
            'linear-gradient(135deg,#fda085,#f6d365)',
            'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
        ];
        const randomGradient = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];
        db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(randomGradient, userId);

        // Send welcome email (best-effort)
        try {
            const transporter = createTransporter();
            await transporter.sendMail({
                from: `"NotioOS" <${GMAIL_USER}>`,
                to: email,
                subject: 'Welcome to NotioOS',
                html: `<h2>Hi ${name},</h2><p>Your NotioOS account has been created. Start capturing your thoughts!</p>`
            });
        } catch (mailErr) {
            console.warn('Welcome email could not be sent:', mailErr.message);
        }

        const token = jwt.sign({ id: userId, name, email }, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', token, { httpOnly: true, sameSite: 'strict', maxAge: 7 * 24 * 3600 * 1000 });
        res.json({ success: true, token, user: { id: userId, name, email, totp_enabled: false } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Registration failed.' });
    }
});

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ error: 'Email and password required.' });

        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
        if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

        if (user.totp_enabled) {
            // Issue a short-lived pre-auth token
            const preToken = jwt.sign({ id: user.id, pre: true }, JWT_SECRET, { expiresIn: '10m' });
            return res.json({ totp_required: true, pre_token: preToken, method: 'totp' });
        }

        if (user.email_2fa_enabled) {
            const preToken = jwt.sign({ id: user.id, pre: true, method: 'email' }, JWT_SECRET, { expiresIn: '10m' });
            return res.json({ totp_required: true, pre_token: preToken, method: 'email' });
        }

        const token = jwt.sign(
            { id: user.id, name: user.name, email: user.email },
            JWT_SECRET, { expiresIn: '7d' }
        );
        res.cookie('token', token, { httpOnly: true, sameSite: 'strict', maxAge: 7 * 24 * 3600 * 1000 });
        const userData = db.prepare('SELECT id, name, email, totp_enabled, email_2fa_enabled, avatar, created_at FROM users WHERE id = ?').get(user.id);
        res.json({ success: true, token, user: userData });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed.' });
    }
});

// ── Email OTP 2FA – Send code ────────────────────────────────────────────────
router.post('/2fa/email/send', require('../middleware/auth'), async (req, res) => {
    try {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 10 * 60 * 1000; // 10 minutes
        const hash = crypto.createHash('sha256').update(otp).digest('hex');
        db.prepare('UPDATE users SET email_otp = ?, email_otp_expires = ? WHERE id = ?').run(hash, expires, user.id);

        const transporter = createTransporter();
        await transporter.sendMail({
            from: `"NotioOS" <${GMAIL_USER}>`,
            to: user.email,
            subject: 'NotioOS – Dein Anmeldecode',
            html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#0e0e0f;color:#f5f5f7;padding:40px;border-radius:18px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:32px;">
            <div style="width:44px;height:44px;background:#007AFF;border-radius:10px;display:flex;align-items:center;justify-content:center;">
              <svg width="22" height="22" viewBox="0 0 40 40" fill="none"><path d="M12 14h16M12 20h10M12 26h13" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>
            </div>
            <span style="font-size:18px;font-weight:700;letter-spacing:-0.03em;">NotioOS</span>
          </div>
          <h2 style="font-size:22px;font-weight:700;margin:0 0 8px;letter-spacing:-0.04em;">Dein Anmeldecode</h2>
          <p style="color:#aeaeb2;margin:0 0 32px;font-size:14px;">Dieser Code ist 10 Minuten gültig.</p>
          <div style="background:#1c1c1e;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:28px;text-align:center;margin-bottom:24px;">
            <span style="font-size:42px;font-weight:700;letter-spacing:0.15em;color:#007AFF;">${otp}</span>
          </div>
          <p style="color:#636366;font-size:12px;margin:0;">Falls du dich nicht angemeldet hast, ignoriere diese E-Mail.</p>
        </div>
      `
        });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'E-Mail konnte nicht gesendet werden.' });
    }
});

// ── Email OTP 2FA – Send during login (with pre_token) ─────────────────────
router.post('/2fa/email/send-login', async (req, res) => {
    try {
        const { pre_token } = req.body;
        let decoded;
        try { decoded = jwt.verify(pre_token, JWT_SECRET); } catch { return res.status(401).json({ error: 'Session abgelaufen.' }); }
        if (!decoded.pre) return res.status(401).json({ error: 'Ungültiger Token.' });

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
        if (!user) return res.status(404).json({ error: 'User nicht gefunden.' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 10 * 60 * 1000;
        const hash = crypto.createHash('sha256').update(otp).digest('hex');
        db.prepare('UPDATE users SET email_otp = ?, email_otp_expires = ? WHERE id = ?').run(hash, expires, user.id);

        const transporter = createTransporter();
        await transporter.sendMail({
            from: `"NotioOS" <${GMAIL_USER}>`,
            to: user.email,
            subject: 'NotioOS – Dein Anmeldecode',
            html: `
        <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;background:#0e0e0f;color:#f5f5f7;padding:40px;border-radius:18px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:32px;">
            <div style="width:44px;height:44px;background:#007AFF;border-radius:10px;display:flex;align-items:center;justify-content:center;">
              <svg width="22" height="22" viewBox="0 0 40 40" fill="none"><path d="M12 14h16M12 20h10M12 26h13" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>
            </div>
            <span style="font-size:18px;font-weight:700;">NotioOS</span>
          </div>
          <h2 style="font-size:22px;font-weight:700;margin:0 0 8px;">Dein Anmeldecode</h2>
          <p style="color:#aeaeb2;margin:0 0 32px;font-size:14px;">Dieser Code ist 10 Minuten gültig.</p>
          <div style="background:#1c1c1e;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:28px;text-align:center;margin-bottom:24px;">
            <span style="font-size:42px;font-weight:700;letter-spacing:0.15em;color:#007AFF;">${otp}</span>
          </div>
          <p style="color:#636366;font-size:12px;margin:0;">Falls du dich nicht angemeldet hast, ignoriere diese E-Mail.</p>
        </div>
      `
        });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'E-Mail konnte nicht gesendet werden.' });
    }
});

// ── Email OTP 2FA – Verify during login ───────────────────────────────────
router.post('/2fa/email/verify-login', async (req, res) => {
    try {
        const { pre_token, otp } = req.body;
        let decoded;
        try { decoded = jwt.verify(pre_token, JWT_SECRET); } catch { return res.status(401).json({ error: 'Session abgelaufen.' }); }
        if (!decoded.pre) return res.status(401).json({ error: 'Ungültiger Token.' });

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
        if (!user || !user.email_otp) return res.status(401).json({ error: 'Kein Code angefordert.' });
        if (Date.now() > user.email_otp_expires) return res.status(401).json({ error: 'Code abgelaufen.' });

        const hash = crypto.createHash('sha256').update(otp.trim()).digest('hex');
        if (hash !== user.email_otp) return res.status(401).json({ error: 'Falscher Code.' });

        db.prepare('UPDATE users SET email_otp = NULL, email_otp_expires = NULL WHERE id = ?').run(user.id);
        const fullToken = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.cookie('token', fullToken, { httpOnly: true, sameSite: 'strict', maxAge: 7 * 24 * 3600 * 1000 });
        const userData = db.prepare('SELECT id, name, email, totp_enabled, email_2fa_enabled, avatar, created_at FROM users WHERE id = ?').get(user.id);
        res.json({ success: true, token: fullToken, user: userData });
    } catch (err) {
        res.status(500).json({ error: 'Fehler bei der Verifizierung.' });
    }
});

// ── Email 2FA – Enable/Disable ─────────────────────────────────────────────
router.post('/2fa/email/toggle', require('../middleware/auth'), (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const newVal = user.email_2fa_enabled ? 0 : 1;
    db.prepare('UPDATE users SET email_2fa_enabled = ? WHERE id = ?').run(newVal, user.id);
    res.json({ success: true, email_2fa_enabled: newVal });
});

// ── Stats ─────────────────────────────────────────────────────────────────
router.get('/stats', require('../middleware/auth'), (req, res) => {
    const uid = req.user.id;
    const total = db.prepare('SELECT COUNT(*) as c FROM notes WHERE user_id = ?').get(uid).c;
    const inbox = db.prepare("SELECT COUNT(*) as c FROM notes WHERE user_id = ? AND location = 'inbox'").get(uid).c;
    const workspace = db.prepare("SELECT COUNT(*) as c FROM notes WHERE user_id = ? AND location = 'workspace'").get(uid).c;
    const archive = db.prepare("SELECT COUNT(*) as c FROM notes WHERE user_id = ? AND location = 'archive'").get(uid).c;
    const idea = db.prepare("SELECT COUNT(*) as c FROM notes WHERE user_id = ? AND prefix = 'IDEA'").get(uid).c;
    const ref = db.prepare("SELECT COUNT(*) as c FROM notes WHERE user_id = ? AND prefix = 'REF'").get(uid).c;
    const log = db.prepare("SELECT COUNT(*) as c FROM notes WHERE user_id = ? AND prefix = 'LOG'").get(uid).c;
    const wsCount = db.prepare('SELECT COUNT(*) as c FROM workspaces WHERE user_id = ?').get(uid).c;
    const dayRow = db.prepare("SELECT CAST((julianday('now') - julianday(created_at)) AS INTEGER) AS days FROM users WHERE id = ?").get(uid);
    const days = dayRow && Number.isFinite(dayRow.days) ? Math.max(0, dayRow.days) : 0;

    const now = new Date();
    const baseUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const daysList = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date(baseUtc - i * 86400000);
        daysList.push(d.toISOString().slice(0, 10));
    }

    const locRows = db.prepare(
        "SELECT date(created_at) as day, location as key, COUNT(*) as c FROM notes WHERE user_id = ? AND date(created_at) >= date('now','-13 day') GROUP BY day, location"
    ).all(uid);
    const prefRows = db.prepare(
        "SELECT date(created_at) as day, prefix as key, COUNT(*) as c FROM notes WHERE user_id = ? AND prefix IS NOT NULL AND date(created_at) >= date('now','-13 day') GROUP BY day, prefix"
    ).all(uid);

    const locByDay = new Map(daysList.map(d => [d, { inbox: 0, workspace: 0, archive: 0 }]));
    locRows.forEach(r => {
        const entry = locByDay.get(r.day);
        if (entry && entry[r.key] !== undefined) entry[r.key] = r.c;
    });

    const prefByDay = new Map(daysList.map(d => [d, { IDEA: 0, REF: 0, LOG: 0 }]));
    prefRows.forEach(r => {
        const entry = prefByDay.get(r.day);
        if (entry && entry[r.key] !== undefined) entry[r.key] = r.c;
    });

    const series = {
        days: daysList,
        inbox: daysList.map(d => locByDay.get(d).inbox),
        workspace: daysList.map(d => locByDay.get(d).workspace),
        archive: daysList.map(d => locByDay.get(d).archive),
        idea: daysList.map(d => prefByDay.get(d).IDEA),
        ref: daysList.map(d => prefByDay.get(d).REF),
        log: daysList.map(d => prefByDay.get(d).LOG),
    };

    res.json({ total, inbox, workspace, archive, idea, ref, log, workspaces: wsCount, days_active: days, series });
});

// ── Update Avatar ─────────────────────────────────────────────────────────
router.post('/avatar', require('../middleware/auth'), (req, res) => {
    const { avatar } = req.body; // base64 data URL or gradient string
    if (!avatar) return res.status(400).json({ error: 'Avatar fehlt.' });
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar, req.user.id);
    res.json({ success: true });
});

// ── 2FA – Generate setup ──────────────────────────────────────────────────────
router.post('/2fa/setup', require('../middleware/auth'), async (req, res) => {
    try {
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        const secret = speakeasy.generateSecret({ name: `NotioOS (${user.email})` });

        db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret.base32, user.id);

        const qrCode = await QRCode.toDataURL(secret.otpauth_url);
        res.json({ qr: qrCode, secret: secret.base32 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '2FA setup failed.' });
    }
});

// ── 2FA – Enable (verify setup token) ────────────────────────────────────────
router.post('/2fa/enable', require('../middleware/auth'), (req, res) => {
    try {
        const { token } = req.body;
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user.totp_secret) return res.status(400).json({ error: 'Run setup first.' });

        const verified = speakeasy.totp.verify({
            secret: user.totp_secret,
            encoding: 'base32',
            token,
            window: 1
        });
        if (!verified) return res.status(401).json({ error: 'Invalid code.' });

        db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(user.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: '2FA enable failed.' });
    }
});

// ── 2FA – Verify during login ─────────────────────────────────────────────────
router.post('/2fa/verify', (req, res) => {
    try {
        const { pre_token, token } = req.body;
        if (!pre_token || !token) return res.status(400).json({ error: 'Missing fields.' });

        let decoded;
        try {
            decoded = jwt.verify(pre_token, JWT_SECRET);
        } catch {
            return res.status(401).json({ error: 'Session expired. Please log in again.' });
        }
        if (!decoded.pre) return res.status(401).json({ error: 'Invalid pre-token.' });

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
        if (!user) return res.status(401).json({ error: 'User not found.' });

        const verified = speakeasy.totp.verify({
            secret: user.totp_secret,
            encoding: 'base32',
            token,
            window: 1
        });
        if (!verified) return res.status(401).json({ error: 'Invalid 2FA code.' });

        const fullToken = jwt.sign(
            { id: user.id, name: user.name, email: user.email },
            JWT_SECRET, { expiresIn: '7d' }
        );
        res.cookie('token', fullToken, { httpOnly: true, sameSite: 'strict', maxAge: 7 * 24 * 3600 * 1000 });
        res.json({ success: true, token: fullToken, user: { id: user.id, name: user.name, email: user.email, totp_enabled: true } });
    } catch (err) {
        res.status(500).json({ error: '2FA verification failed.' });
    }
});

// ── Disable 2FA ───────────────────────────────────────────────────────────────
router.post('/2fa/disable', require('../middleware/auth'), (req, res) => {
    db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').run(req.user.id);
    res.json({ success: true });
});

// ── Me ────────────────────────────────────────────────────────────────────────
router.get('/me', require('../middleware/auth'), (req, res) => {
    const user = db.prepare('SELECT id, name, email, totp_enabled, email_2fa_enabled, avatar, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user });
});

// ── Logout ────────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

module.exports = router;
