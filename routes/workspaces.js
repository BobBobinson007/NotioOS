const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db/database');
const router = express.Router();

router.use(auth);

// ── List workspaces (flat list with parent_id) ────────────────────────────────
router.get('/', (req, res) => {
    const workspaces = db.prepare(
        'SELECT * FROM workspaces WHERE user_id = ? ORDER BY name ASC'
    ).all(req.user.id);
    res.json({ workspaces });
});

// ── Create workspace ──────────────────────────────────────────────────────────
router.post('/', (req, res) => {
    const { name, parent_id = null } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });

    if (parent_id) {
        const parent = db.prepare('SELECT id FROM workspaces WHERE id = ? AND user_id = ?').get(parent_id, req.user.id);
        if (!parent) return res.status(404).json({ error: 'Parent workspace not found.' });
    }

    const result = db.prepare(
        'INSERT INTO workspaces (user_id, name, parent_id) VALUES (?, ?, ?)'
    ).run(req.user.id, name, parent_id);
    const ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ workspace: ws });
});

// ── Rename workspace ──────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
    const ws = db.prepare('SELECT * FROM workspaces WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!ws) return res.status(404).json({ error: 'Workspace not found.' });
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name, ws.id);
    res.json({ workspace: { ...ws, name } });
});

// ── Delete workspace ──────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
    const ws = db.prepare('SELECT * FROM workspaces WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!ws) return res.status(404).json({ error: 'Workspace not found.' });
    // Move notes from deleted workspace to inbox
    db.prepare("UPDATE notes SET location = 'inbox', workspace_id = NULL WHERE workspace_id = ?").run(ws.id);
    // Delete sub-workspaces
    db.prepare('DELETE FROM workspaces WHERE parent_id = ?').run(ws.id);
    db.prepare('DELETE FROM workspaces WHERE id = ?').run(ws.id);
    res.json({ success: true });
});

module.exports = router;
