const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware to all match routes
router.use(auth);

router.get('/discover', async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Find users the current user hasn't swiped on yet and aggregate their interests
        const query = `
            SELECT u.id, u.username, u.phantom_alias, u.bio, u.ideology, u.vibe,
                   COALESCE(json_agg(i.name) FILTER (WHERE i.name IS NOT NULL), '[]') as interests
            FROM users u
            LEFT JOIN user_interests ui ON ui.user_id = u.id
            LEFT JOIN interests i ON i.id = ui.interest_id
            WHERE u.id != $1 
            AND u.id NOT IN (SELECT swiped_id FROM swipes WHERE swiper_id = $1)
            GROUP BY u.id
            LIMIT 20
        `;
        
        const result = await db.query(query, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error fetching discover list' });
    }
});

router.post('/swipe', async (req, res) => {
    try {
        const swiperId = req.user.id;
        const { swipedId, direction } = req.body;
        
        if (!swipedId || !['left', 'right'].includes(direction)) {
            return res.status(400).json({ error: 'Valid swipedId and direction (left, right) required' });
        }

        if (swiperId === swipedId) {
            return res.status(400).json({ error: 'Cannot swipe on yourself' });
        }

        // Record the swipe
        await db.query(
            'INSERT INTO swipes (swiper_id, swiped_id, direction) VALUES ($1, $2, $3) ON CONFLICT (swiper_id, swiped_id) DO NOTHING',
            [swiperId, swipedId, direction]
        );

        let matchCreated = false;
        let matchPercent = 0;
        let conversationId = null;

        // If it's a right swipe, check for mutual swipe
        if (direction === 'right') {
            const mutualSwipeCheck = await db.query(
                `SELECT id FROM swipes WHERE swiper_id = $1 AND swiped_id = $2 AND direction = 'right'`,
                [swipedId, swiperId]
            );

            if (mutualSwipeCheck.rows.length > 0) {
                // IT'S A MATCH!
                matchCreated = true;
                
                // Calculate match percentage
                // Match % = (shared interests) / (total unique interests between both) * 100
                const interestsA = await db.query('SELECT interest_id FROM user_interests WHERE user_id = $1', [swiperId]);
                const interestsB = await db.query('SELECT interest_id FROM user_interests WHERE user_id = $1', [swipedId]);
                
                const setA = new Set(interestsA.rows.map(r => r.interest_id));
                const setB = new Set(interestsB.rows.map(r => r.interest_id));
                
                let shared = 0;
                setA.forEach(id => {
                    if (setB.has(id)) shared++;
                });
                
                const totalUnique = new Set([...setA, ...setB]).size;
                matchPercent = totalUnique > 0 ? Math.round((shared / totalUnique) * 100) : 0;

                await db.query('BEGIN');
                
                // Insert Match
                const matchRes = await db.query(
                    `INSERT INTO matches (user_a, user_b, match_percent) 
                     VALUES ($1, $2, $3) 
                     ON CONFLICT DO NOTHING RETURNING id`,
                    [Math.min(swiperId, swipedId), Math.max(swiperId, swipedId), matchPercent]
                );
                
                const matchId = matchRes.rows[0]?.id;
                
                if (matchId) {
                    // Create Conversation
                    const convRes = await db.query(
                        'INSERT INTO conversations (match_id) VALUES ($1) RETURNING id',
                        [matchId]
                    );
                    conversationId = convRes.rows[0].id;
                }

                await db.query('COMMIT');
            }
        }

        res.json({ 
            success: true, 
            match: matchCreated, 
            matchPercent: matchCreated ? matchPercent : undefined,
            conversationId: conversationId
        });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Internal server error processing swipe' });
    }
});

router.get('/list', async (req, res) => {
    try {
        const userId = req.user.id;
        
        const query = `
            SELECT m.id as match_id, m.match_percent, m.matched_at,
                   c.id as conversation_id,
                   u.id as matched_user_id, u.phantom_alias, u.username, u.bio,
                   COALESCE(json_agg(i.name) FILTER (WHERE i.name IS NOT NULL), '[]') as interests
            FROM matches m
            JOIN users u ON u.id = CASE WHEN m.user_a = $1 THEN m.user_b ELSE m.user_a END
            JOIN conversations c ON c.match_id = m.id
            LEFT JOIN user_interests ui ON ui.user_id = u.id
            LEFT JOIN interests i ON i.id = ui.interest_id
            WHERE m.user_a = $1 OR m.user_b = $1
            GROUP BY m.id, c.id, u.id
            ORDER BY m.matched_at DESC
        `;
        
        const result = await db.query(query, [userId]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error fetching matches' });
    }
});

module.exports = router;
