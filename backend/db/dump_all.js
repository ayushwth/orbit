require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('./index');

async function dumpAll() {
    try {
        console.log('========================================');
        console.log('  ORBIT DATABASE — FULL DATA DUMP');
        console.log('========================================\n');

        // 1. USERS
        const users = await db.query('SELECT id, username, phantom_alias, bio, ideology, vibe, anonymity_level, created_at FROM users ORDER BY id');
        console.log(`=== USERS (${users.rows.length}) ===`);
        users.rows.forEach(u => {
            console.log(`  [${u.id}] ${u.username} | ${u.phantom_alias} | bio: "${u.bio}" | ideology: ${u.ideology} | vibe: ${u.vibe} | joined: ${u.created_at}`);
        });

        // 2. INTERESTS
        const interests = await db.query('SELECT id, name FROM interests ORDER BY id');
        console.log(`\n=== INTERESTS (${interests.rows.length}) ===`);
        interests.rows.forEach(i => console.log(`  [${i.id}] ${i.name}`));

        // 3. USER_INTERESTS
        const ui = await db.query(`
            SELECT ui.user_id, u.username, i.name as interest 
            FROM user_interests ui 
            JOIN users u ON u.id = ui.user_id 
            JOIN interests i ON i.id = ui.interest_id 
            ORDER BY ui.user_id
        `);
        console.log(`\n=== USER INTERESTS (${ui.rows.length} entries) ===`);
        const grouped = {};
        ui.rows.forEach(r => {
            if (!grouped[r.username]) grouped[r.username] = [];
            grouped[r.username].push(r.interest);
        });
        Object.keys(grouped).forEach(u => {
            console.log(`  ${u}: [${grouped[u].join(', ')}]`);
        });

        // 4. SWIPES
        const swipes = await db.query(`
            SELECT s.id, u1.username as swiper, u2.username as swiped, s.direction, s.created_at
            FROM swipes s
            JOIN users u1 ON u1.id = s.swiper_id
            JOIN users u2 ON u2.id = s.swiped_id
            ORDER BY s.created_at
        `);
        console.log(`\n=== SWIPES (${swipes.rows.length}) ===`);
        swipes.rows.forEach(s => {
            const emoji = s.direction === 'right' ? '👉 RIGHT (like)' : '👈 LEFT (pass)';
            console.log(`  [${s.id}] ${s.swiper} → ${s.swiped}: ${emoji} | ${s.created_at}`);
        });

        // 5. MATCHES
        const matches = await db.query(`
            SELECT m.id, u1.username as user_a, u2.username as user_b, m.match_percent, m.matched_at
            FROM matches m
            JOIN users u1 ON u1.id = m.user_a
            JOIN users u2 ON u2.id = m.user_b
            ORDER BY m.matched_at
        `);
        console.log(`\n=== MATCHES (${matches.rows.length}) ===`);
        if (matches.rows.length === 0) console.log('  (no matches yet)');
        matches.rows.forEach(m => {
            console.log(`  [${m.id}] ${m.user_a} ❤️ ${m.user_b} | ${m.match_percent}% compatibility | ${m.matched_at}`);
        });

        // 6. CONVERSATIONS
        const convos = await db.query(`
            SELECT c.id as conv_id, c.match_id, u1.username as user_a, u2.username as user_b, c.created_at
            FROM conversations c
            JOIN matches m ON c.match_id = m.id
            JOIN users u1 ON u1.id = m.user_a
            JOIN users u2 ON u2.id = m.user_b
            ORDER BY c.created_at
        `);
        console.log(`\n=== CONVERSATIONS (${convos.rows.length}) ===`);
        if (convos.rows.length === 0) console.log('  (no conversations yet)');
        convos.rows.forEach(c => {
            console.log(`  [conv ${c.conv_id}] between ${c.user_a} & ${c.user_b} | started: ${c.created_at}`);
        });

        // 7. MESSAGES
        const msgs = await db.query(`
            SELECT msg.id, msg.conversation_id, u.username as sender, msg.content, msg.sent_at
            FROM messages msg
            JOIN users u ON u.id = msg.sender_id
            ORDER BY msg.conversation_id, msg.sent_at
        `);
        console.log(`\n=== MESSAGES (${msgs.rows.length}) ===`);
        if (msgs.rows.length === 0) console.log('  (no messages yet)');
        msgs.rows.forEach(m => {
            console.log(`  [conv ${m.conversation_id}] ${m.sender}: "${m.content}" | ${m.sent_at}`);
        });

        console.log('\n========================================');
        console.log('  END OF DUMP');
        console.log('========================================');

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

dumpAll();
