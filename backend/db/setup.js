const fs = require('fs');
const path = require('path');
const db = require('./index');

async function setupDatabase() {
    try {
        console.log('Reading schema.sql...');
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        
        console.log('Executing schema...');
        await db.query(schemaSql);
        
        console.log('Database schema created successfully!');
        
        // Now run the seed logic
        require('./seed');
    } catch (err) {
        console.error('Error setting up database:', err);
        process.exit(1);
    }
}

setupDatabase();
