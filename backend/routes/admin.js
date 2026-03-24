const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /admin/dashboard-data — returns all tables for the dashboard
router.get('/dashboard-data', async (req, res) => {
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

module.exports = router;
