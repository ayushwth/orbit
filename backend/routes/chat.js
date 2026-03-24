const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

router.use(auth);

// Helper to check if user is in a conversation
async function isUserInConversation(userId, conversationId) {
    const query = `
        SELECT c.id FROM conversations c
        JOIN matches m ON c.match_id = m.id
        WHERE c.id = $1 AND (m.user_a = $2 OR m.user_b = $2)
    `;
    const res = await db.query(query, [conversationId, userId]);
    return res.rows.length > 0;
}

router.get('/conversations', async (req, res) => {
    try {
        const userId = req.user.id;
        
        const query = `
            SELECT c.id as conversation_id, c.created_at as conversation_started_at,
                   m.id as match_id, m.match_percent,
                   u.id as other_user_id, u.phantom_alias, u.username
            FROM conversations c
            JOIN matches m ON c.match_id = m.id
            JOIN users u ON u.id = CASE WHEN m.user_a = $1 THEN m.user_b ELSE m.user_a END
            WHERE m.user_a = $1 OR m.user_b = $1
            ORDER BY c.created_at DESC
        `;
        
        const result = await db.query(query, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error fetching conversations' });
    }
});

router.get('/messages/:conversationId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId } = req.params;

        if (!(await isUserInConversation(userId, conversationId))) {
            return res.status(403).json({ error: 'Access denied to this conversation' });
        }

        const query = `
            SELECT id, sender_id, content, sent_at as created_at 
            FROM messages 
            WHERE conversation_id = $1 
            ORDER BY sent_at ASC
        `;
        const result = await db.query(query, [conversationId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error fetching messages' });
    }
});

router.post('/messages', async (req, res) => {
    try {
        const userId = req.user.id;
        const { conversationId, content } = req.body;

        if (!conversationId || !content) {
            return res.status(400).json({ error: 'conversationId and content required' });
        }

        if (!(await isUserInConversation(userId, conversationId))) {
            return res.status(403).json({ error: 'Access denied to this conversation' });
        }

        const result = await db.query(
            'INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *',
            [conversationId, userId, content]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error sending message' });
    }
});

module.exports = router;
