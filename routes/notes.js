const express = require('express');
const auth = require('../middleware/auth');
const db = require('../db/database');
const router = express.Router();

router.use(auth);

// ── List notes ────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    const { location, workspace_id, prefix, search } = req.query;
    let query = 'SELECT * FROM notes WHERE user_id = ?';
    const params = [req.user.id];

    if (location) { query += ' AND location = ?'; params.push(location); }
    if (workspace_id) { query += ' AND workspace_id = ?'; params.push(workspace_id); }
    if (prefix) { query += ' AND prefix = ?'; params.push(prefix); }
    if (search) { query += ' AND (title LIKE ? OR content LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    query += ' ORDER BY updated_at DESC';
    const notes = db.prepare(query).all(...params);
    res.json({ notes });
});

// ── Get single note ──────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
    const note = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!note) return res.status(404).json({ error: 'Note not found.' });
    res.json({ note });
});

// ── Create note ───────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
    const { title = 'Untitled', content = '', prefix = null, location = 'inbox', workspace_id = null } = req.body;
    const result = db.prepare(
        'INSERT INTO notes (user_id, workspace_id, title, content, prefix, location) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.user.id, workspace_id, title, content, prefix, location);
    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ note });
});

// ── Update note ───────────────────────────────────────────────────────────────
router.put('/:id', (req, res) => {
    const note = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!note) return res.status(404).json({ error: 'Note not found.' });

    const { title, content, prefix } = req.body;
    db.prepare(
        'UPDATE notes SET title = ?, content = ?, prefix = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(
        title ?? note.title,
        content ?? note.content,
        prefix !== undefined ? prefix : note.prefix,
        note.id
    );
    const updated = db.prepare('SELECT * FROM notes WHERE id = ?').get(note.id);
    res.json({ note: updated });
});

// ── Move note (location + optional workspace) ─────────────────────────────────
router.patch('/:id/move', (req, res) => {
    const note = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!note) return res.status(404).json({ error: 'Note not found.' });

    const { location, workspace_id } = req.body;
    db.prepare(
        'UPDATE notes SET location = ?, workspace_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(location ?? note.location, workspace_id !== undefined ? workspace_id : note.workspace_id, note.id);

    const updated = db.prepare('SELECT * FROM notes WHERE id = ?').get(note.id);
    res.json({ note: updated });
});

// ── Delete note ───────────────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
    const note = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!note) return res.status(404).json({ error: 'Note not found.' });
    db.prepare('DELETE FROM notes WHERE id = ?').run(note.id);
    res.json({ success: true });
});

module.exports = router;
