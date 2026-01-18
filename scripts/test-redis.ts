/**
 * Simple Redis Connectivity Test - TypeScript Version
 * Verifies basic connectivity and read/write operations.
 * Integrates with the professional logging system.
 */

import 'dotenv/config';
import Redis from 'ioredis';
import { professionalLogger } from '../src/lib/logging';

const { REDIS_URL } = process.env;

async function testRedis() {
    const correlationId = `redis-test-${Date.now()}`;
    
    if (!REDIS_URL) {
        professionalLogger.fatal('REDIS_URL is not defined in environment variables', { correlationId });
        process.exit(1);
    }

    professionalLogger.info('Attempting to connect to Redis...', { correlationId });

    const redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
    });

    redis.on('connect', () => {
        professionalLogger.info('✅ Connected to Redis successfully!', { correlationId });
    });

    redis.on('error', (err: Error) => {
        professionalLogger.error('❌ Redis Connection Error', { 
            correlationId, 
            error: err.message 
        });
        process.exit(1);
    });

    try {
        const testValue = 'BobyWorld Professional Test';
        await redis.set('boby_test_key', testValue, 'EX', 10);
        const val = await redis.get('boby_test_key');
        
        if (val === testValue) {
            professionalLogger.info('📝 Test Write/Read: SUCCESS', { correlationId });
            process.exit(0);
        } else {
            throw new Error(`Data mismatch: expected ${testValue}, got ${val}`);
        }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        professionalLogger.fatal('❌ Redis Test Operation Failed', { 
            correlationId, 
            error: errorMessage 
        });
        process.exit(1);
    }
}

testRedis().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
