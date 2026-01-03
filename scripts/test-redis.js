
const Redis = require('ioredis');
require('dotenv').config();

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
    console.error('❌ REDIS_URL is not defined in .env');
    process.exit(1);
}

console.log('Attempting to connect to Redis...');

const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
});

redis.on('connect', () => {
    console.log('✅ Connected to Redis!');
});

redis.on('error', (err) => {
    console.error('❌ Redis Connection Error:', err.message);
    process.exit(1);
});

async function test() {
    try {
        await redis.set('test_key', 'Hello from Cline!', 'EX', 10);
        const val = await redis.get('test_key');
        console.log('📝 Test Write/Read:', val === 'Hello from Cline!' ? 'Success' : 'Failed');
        process.exit(0);
    } catch (e) {
        console.error('❌ Operation Failed:', e);
        process.exit(1);
    }
}

test();
