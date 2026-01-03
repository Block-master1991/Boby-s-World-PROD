
require('dotenv').config({ path: '.env.local' });
const Redis = require('ioredis');

async function testConnection() {
    console.log('🔍 Testing Redis Connection for Upstash...');

    const url = process.env.REDIS_URL;
    if (!url) {
        console.error('❌ REDIS_URL is not defined in environment variables.');
        return;
    }

    // SIMULATING THE FIX APPLIED IN src/lib/redis.ts
    // 1. Remove CLI artifacts
    let sanitizedUrl = url
        .replace(/^redis-cli\s+/, '')
        .replace(/--tls\s+/, '')
        .replace(/-u\s+/, '')
        .trim();

    // 2. Auto-upgrade Upstash to TLS
    if (sanitizedUrl.includes('upstash') && sanitizedUrl.startsWith('redis://')) {
        sanitizedUrl = sanitizedUrl.replace('redis://', 'rediss://');
        console.log('✨ Auto-corrected URL -> rediss:// (TLS Enforced)');
    }

    // Mask for logs
    const maskedUrl = sanitizedUrl.replace(/:([^:@]+)@/, ':****@');
    console.log(`📡 CONNECTING TO: ${maskedUrl}`);

    const redis = new Redis(sanitizedUrl, {
        connectTimeout: 5000,
        maxRetriesPerRequest: 1,
        tls: sanitizedUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined
    });

    redis.on('error', (err) => {
        console.error('❌ Connection Error:', err.message);
        if (err.code === 'ENOTFOUND') console.error('   -> Hostname cannot be resolved. Check internet or DNS.');
        if (err.code === 'ETIMEDOUT') console.error('   -> Connection timed out. Check firewall or port 6379.');
        if (err.message.includes('WRONGPASS')) console.error('   -> Invalid password/credentials.');
    });

    try {
        console.log('⏳ Connecting...');
        await redis.get('ping_test'); // Trigger connection
        console.log('✅ Connected successfully!');

        console.log('📝 Testing Write...');
        await redis.set('boby_diagnostic', 'success', 'EX', 60);
        console.log('✅ Write successful.');

        console.log('📖 Testing Read...');
        const value = await redis.get('boby_diagnostic');
        console.log(`✅ Read successful. Value: ${value}`);

        console.log('🎉 Redis is working correctly from this script.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Diagnostic Failed:', error);
        process.exit(1);
    }
}

testConnection();
