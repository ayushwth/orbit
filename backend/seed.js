const db = require('./db/index.js');
const bcrypt = require('bcrypt');

async function seed() {
    try {
        // Hash passwords properly with bcrypt
        const hash1 = await bcrypt.hash('password123', 10);
        const hash2 = await bcrypt.hash('password123', 10);
        const hash3 = await bcrypt.hash('password123', 10);

        // Update existing mock users with proper bcrypt hashes, or insert if not present
        await db.query(`
            INSERT INTO users (username, password_hash, phantom_alias, bio, ideology, vibe) 
            VALUES 
            ('mock1', $1, 'Phantom #1111', 'I think free will is a myth. Let us debate.', 'Stoic', 'Overthinker'),
            ('mock2', $2, 'Phantom #2222', 'Building open source tools for a better future.', 'Pragmatist', 'Builder'),
            ('mock3', $3, 'Phantom #3333', 'Competitive chess player and philosopher.', 'Rationalist', 'Quiet rebel')
            ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
        `, [hash1, hash2, hash3]);

        // Give them some interests
        const res = await db.query('SELECT id, username FROM users WHERE username IN ($1, $2, $3)', ['mock1', 'mock2', 'mock3']);
        const interestsEnum = {
            'mock1': [1, 5, 8], // Philosophy, Jazz, AI
            'mock2': [2, 4, 7], // Open Source, Climate, Startups
            'mock3': [1, 12, 10] // Philosophy, Chess, Politics
        };

        for (let row of res.rows) {
            const user_id = row.id;
            const intents = interestsEnum[row.username];
            for (let interest_id of intents) {
                await db.query('INSERT INTO user_interests (user_id, interest_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user_id, interest_id]);
            }
        }
        
        console.log('Seed successful — all mock users now have bcrypt-hashed password: password123');
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}

seed();
