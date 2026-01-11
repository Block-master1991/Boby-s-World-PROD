/**
 * Redis Diagnostic Utility - TypeScript Version
 * Validates connection, read/write capabilities, and auto-corrects URLs for Upstash TLS.
 * Integrates with the professional logging system.
 */

import 'dotenv/config';
import Redis from 'ioredis';
import { professionalLogger } from '../src/lib/logging';

async function diagnoseRedis() {
    const correlationId = `redis-diag-${Date.now()}`;
    professionalLogger.info('🔍 Starting Redis Configuration Diagnostic', { correlationId });

    const url = process.env.REDIS_URL;
    if (!url) {
        professionalLogger.fatal('REDIS_URL is not defined in environment variables', { correlationId });
        process.exit(1);
    }

    // Sanitize URL (Matches production logic in src/lib/redis.ts)
    let sanitizedUrl = url
        .replace(/^redis-cli\s+/, '')
        .replace(/--tls\s+/, '')
        .replace(/-u\s+/, '')
        .trim();

    // Auto-upgrade Upstash to TLS
    if (sanitizedUrl.includes('upstash') && sanitizedUrl.startsWith('redis://')) {
        sanitizedUrl = sanitizedUrl.replace('redis://', 'rediss://');
        professionalLogger.info('✨ Auto-corrected URL to rediss:// (Enforced TLS for Upstash)', { correlationId });
    }

    const maskedUrl = sanitizedUrl.replace(/:([^:@]+)@/, ':****@');
    professionalLogger.debug(`Targeting Redis instance: ${maskedUrl}`, { correlationId });

    const redis = new Redis(sanitizedUrl, {
        connectTimeout: 5000,
        maxRetriesPerRequest: 1,
        tls: sanitizedUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined
    });

    redis.on('error', (err: any) => {
        professionalLogger.error('Redis Socket Error detected', { 
            correlationId, 
            error: err.message,
            code: err.code 
        });
    });

    try {
        professionalLogger.info('⏳ Attempting to establish connection...', { correlationId });
        await redis.get('ping_test'); 
        professionalLogger.info('✅ Basic connection established', { correlationId });

        professionalLogger.info('📝 Testing write operations (with 60s TTL)...', { correlationId });
        await redis.set('boby_diagnostic', 'success', 'EX', 60);
        
        professionalLogger.info('📖 Testing read operations...', { correlationId });
        const value = await redis.get('boby_diagnostic');
        
        if (value === 'success') {
            professionalLogger.info('🎉 Redis Diagnostic passed successfully!', { correlationId });
        } else {
            throw new Error(`Data integrity check failed. Expected 'success', got '${value}'`);
        }

        redis.disconnect();
        process.exit(0);
    } catch (error: any) {
        professionalLogger.fatal('Redis Diagnostic failed miserably', { 
            correlationId,
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
}

diagnoseRedis();
