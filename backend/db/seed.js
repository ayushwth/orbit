const db = require('./index');

const initialInterests = [
    'Philosophy', 'Chess', 'AI & ML', 'Literature', 
    'Open Source', 'Climate', 'Stoicism', 'Debate', 
    'Psychology', 'Economics', 'Film', 'Mathematics', 
    'History', 'Music Theory', 'Startups'
];

async function seed() {
    try {
        console.log('Seeding initial interests...');
        for (const name of initialInterests) {
            await db.query(
                'INSERT INTO interests (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
                [name]
            );
        }
        console.log('Seeding completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Error seeding database:', err);
        process.exit(1);
    }
}

seed();
