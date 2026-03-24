const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

function generatePhantomAlias() {
    const code = Math.floor(1000 + Math.random() * 9000);
    return `Phantom #${code}`;
}

router.post('/register', async (req, res) => {
    try {
        const { username, password, interests, bio, ideology, vibe } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        // Check if user exists
        const userCheck = await db.query('SELECT id FROM users WHERE username = $1', [username]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        const password_hash = await bcrypt.hash(password, 10);
        let phantom_alias = generatePhantomAlias();
        
        // Ensure uniqueness of phantom alias
        let aliasCheck = await db.query('SELECT id FROM users WHERE phantom_alias = $1', [phantom_alias]);
        while(aliasCheck.rows.length > 0) {
            phantom_alias = generatePhantomAlias();
            aliasCheck = await db.query('SELECT id FROM users WHERE phantom_alias = $1', [phantom_alias]);
        }

        // Handle transaction for inserting user + interests
        await db.query('BEGIN');
        
        const result = await db.query(
            'INSERT INTO users (username, password_hash, phantom_alias, bio, ideology, vibe) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, phantom_alias',
            [username, password_hash, phantom_alias, bio, ideology, vibe]
        );
        
        const user = result.rows[0];

        // Insert initial interests if provided
        if (interests && Array.isArray(interests) && interests.length > 0) {
            for (const interestName of interests) {
                // Find the interest ID by name
                const intRes = await db.query('SELECT id FROM interests WHERE name = $1', [interestName]);
                if (intRes.rows.length > 0) {
                    const interestId = intRes.rows[0].id;
                    await db.query(
                        'INSERT INTO user_interests (user_id, interest_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                        [user.id, interestId]
                    );
                }
            }
        }

        await db.query('COMMIT');

        const token = jwt.sign(
            { id: user.id, username: user.username, phantom_alias: user.phantom_alias },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'User created successfully',
            user: { id: user.id, username: user.username, phantom_alias: user.phantom_alias },
            token
        });

    } catch (err) {
        await db.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const result = await db.query('SELECT id, username, password_hash, phantom_alias FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, phantom_alias: user.phantom_alias },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            user: { id: user.id, username: user.username, phantom_alias: user.phantom_alias },
            token
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const authMiddleware = require('../middleware/auth');

router.get('/me', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const userResult = await db.query(
            'SELECT id, username, phantom_alias, bio, ideology, vibe, anonymity_level, created_at FROM users WHERE id = $1',
            [userId]
        );
        
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = userResult.rows[0];
        
        const interestsResult = await db.query(
            `SELECT i.name FROM interests i 
             JOIN user_interests ui ON i.id = ui.interest_id 
             WHERE ui.user_id = $1`,
            [userId]
        );
        
        user.interests = interestsResult.rows.map(row => row.name);
        
        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error fetching profile' });
    }
});

module.exports = router;
