require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('./index');

async function verify() {
    const tables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
    console.log('=== TABLES ===');
    tables.rows.forEach(r => console.log('  ✓', r.tablename));

    const interests = await db.query('SELECT id, name FROM interests ORDER BY id');
    console.log('\n=== INTERESTS (' + interests.rows.length + ') ===');
    interests.rows.forEach(r => console.log('  ' + r.id + '. ' + r.name));

    process.exit(0);
}
verify();
