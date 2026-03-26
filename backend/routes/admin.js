const express = require('express');
const db = require('../db');

const router = express.Router();

// ── ADMIN AUTH MIDDLEWARE ──
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'orbit-admin-2024';

// POST /admin/login — verify admin password, return a session token
router.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        // Simple base64 session token (good enough for admin page)
        const token = Buffer.from(`admin:${Date.now()}:${ADMIN_PASSWORD}`).toString('base64');
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, error: 'Wrong password' });
    }
});

// Middleware to protect all other admin routes
function requireAdmin(req, res, next) {
    const token = req.headers['x-admin-token'];
    if (!token) return res.status(401).json({ error: 'Admin token required' });
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        if (decoded.startsWith('admin:') && decoded.endsWith(`:${ADMIN_PASSWORD}`)) {
            return next();
        }
    } catch(e) {}
    res.status(401).json({ error: 'Invalid admin token' });
}

// GET /admin/dashboard-data — returns all tables for the dashboard
router.get('/dashboard-data', requireAdmin, async (req, res) => {
    try {
        const [users, interests, userInterests, swipes, matches, conversations, messages] = await Promise.all([
            db.query(`SELECT id, username, phantom_alias, bio, ideology, vibe, anonymity_level, created_at FROM users ORDER BY id`),
            db.query(`SELECT id, name FROM interests ORDER BY id`),
            db.query(`
                SELECT ui.user_id, u.username, i.name as interest 
                FROM user_interests ui 
                JOIN users u ON u.id = ui.user_id 
                JOIN interests i ON i.id = ui.interest_id 
                ORDER BY ui.user_id
            `),
            db.query(`
                SELECT s.id, s.swiper_id, s.swiped_id,
                       u1.username as swiper, u1.phantom_alias as swiper_alias,
                       u2.username as swiped, u2.phantom_alias as swiped_alias,
                       s.direction, s.created_at
                FROM swipes s
                JOIN users u1 ON u1.id = s.swiper_id
                JOIN users u2 ON u2.id = s.swiped_id
                ORDER BY s.created_at DESC
            `),
            db.query(`
                SELECT m.id, m.user_a, m.user_b, m.match_percent, m.matched_at,
                       u1.username as user_a_name, u1.phantom_alias as user_a_alias,
                       u2.username as user_b_name, u2.phantom_alias as user_b_alias
                FROM matches m
                JOIN users u1 ON u1.id = m.user_a
                JOIN users u2 ON u2.id = m.user_b
                ORDER BY m.matched_at DESC
            `),
            db.query(`
                SELECT c.id as conversation_id, c.match_id, c.created_at,
                       u1.username as user_a_name, u2.username as user_b_name
                FROM conversations c
                JOIN matches m ON c.match_id = m.id
                JOIN users u1 ON u1.id = m.user_a
                JOIN users u2 ON u2.id = m.user_b
                ORDER BY c.created_at DESC
            `),
            db.query(`
                SELECT msg.id, msg.conversation_id, msg.sender_id, 
                       u.username as sender, u.phantom_alias as sender_alias,
                       msg.content, msg.sent_at
                FROM messages msg
                JOIN users u ON u.id = msg.sender_id
                ORDER BY msg.sent_at DESC
                LIMIT 100
            `)
        ]);

        // Group interests by user
        const userInterestsMap = {};
        userInterests.rows.forEach(row => {
            if (!userInterestsMap[row.username]) userInterestsMap[row.username] = [];
            userInterestsMap[row.username].push(row.interest);
        });

        res.json({
            timestamp: new Date().toISOString(),
            stats: {
                totalUsers: users.rows.length,
                totalSwipes: swipes.rows.length,
                rightSwipes: swipes.rows.filter(s => s.direction === 'right').length,
                leftSwipes: swipes.rows.filter(s => s.direction === 'left').length,
                totalMatches: matches.rows.length,
                totalConversations: conversations.rows.length,
                totalMessages: messages.rows.length,
                totalInterests: interests.rows.length
            },
            users: users.rows,
            interests: interests.rows,
            userInterests: userInterestsMap,
            swipes: swipes.rows,
            matches: matches.rows,
            conversations: conversations.rows,
            messages: messages.rows
        });
    } catch (err) {
        console.error('Admin dashboard error:', err);
        res.status(500).json({ error: 'Failed to load dashboard data' });
    }
});

// POST /admin/delete-users — deletes specific users by username (cascade handles the rest)
router.post('/delete-users', requireAdmin, async (req, res) => {
    try {
        const { usernames } = req.body;
        if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
            return res.status(400).json({ error: 'Provide a "usernames" array in request body' });
        }
        const result = await db.query(
            `DELETE FROM users WHERE username = ANY($1::text[]) RETURNING username, phantom_alias`,
            [usernames]
        );
        res.json({ deleted: result.rows, count: result.rowCount });
    } catch (err) {
        console.error('Delete users error:', err);
        res.status(500).json({ error: 'Failed to delete users' });
    }
});

// GET /admin/nuke-recent?hours=24 — deletes all data created in last N hours (default 24h)
router.get('/nuke-recent', requireAdmin, async (req, res) => {
    const hours = parseInt(req.query.hours) || 24;
    const client = await require('../db')._pool
        ? require('../db')._pool.connect()
        : null;
    try {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
        // Find user IDs to delete
        const usersRes = await db.query(`SELECT id, username FROM users WHERE created_at >= $1`, [since]);
        const ids = usersRes.rows.map(r => r.id);
        if (ids.length === 0) return res.json({ message: 'No recent users found', deleted: [] });

        // Delete (cascade handles swipes, matches, messages, conversations via FK)
        const delRes = await db.query(`DELETE FROM users WHERE id = ANY($1::int[]) RETURNING username, phantom_alias`, [ids]);
        res.json({ deleted: delRes.rows, count: delRes.rowCount, since });
    } catch (err) {
        console.error('Nuke recent error:', err);
        res.status(500).json({ error: 'Failed to nuke recent data' });
    }
});

module.exports = router;
