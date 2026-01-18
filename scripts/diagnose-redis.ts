import { Redis, type RedisOptions } from 'ioredis';
import { professionalLogger } from '../src/lib/logging/index';

const DIAGNOSTIC_TIMEOUT = 5000;

async function diagnoseRedis() {
    const correlationId = `redis-diag-${Date.now()}`;
    professionalLogger.info('🔍 Starting Redis Configuration Diagnostic', { correlationId });

    const url = process.env['REDIS_URL'];
    if (!url) {
        professionalLogger.fatal('REDIS_URL is not defined in environment variables', { correlationId });
        process.exit(1);
    }

    try {
        const isTls = parseAndLogDetails(url, correlationId);
        await testConnection(url, isTls, correlationId);
        
        professionalLogger.info('✅ Connection SUCCESSFUL: PONG received', { correlationId });
        process.exit(0);
    } catch (error) {
        handleError(error, correlationId);
    }
}

function parseAndLogDetails(url: string, correlationId: string): boolean {
    professionalLogger.info('👉 Validating REDIS_URL format...', { correlationId });
    const parsed = new URL(url);
    
    professionalLogger.info('Connection Details:', {
        host: parsed.hostname,
        port: parsed.port,
        protocol: parsed.protocol,
        hasAuth: !!parsed.password,
        correlationId
    });

    return parsed.protocol.includes('rediss');
}

async function testConnection(url: string, isTls: boolean, correlationId: string) {
    const options: RedisOptions = {
        connectTimeout: DIAGNOSTIC_TIMEOUT,
        maxRetriesPerRequest: 1,
    };

    if (isTls) {
        options.tls = { rejectUnauthorized: false };
    }

    professionalLogger.info('👉 Attempting connection...', { 
        tls: isTls,
        timeout: DIAGNOSTIC_TIMEOUT,
        correlationId
    });

    const redis = new Redis(url, options);

    try {
        const pingPromise = redis.ping();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timed out')), DIAGNOSTIC_TIMEOUT)
        );

        await Promise.race([pingPromise, timeoutPromise]);
    } finally {
        await redis.quit();
    }
}

function handleError(error: unknown, correlationId: string) {
    const err = error as Error;
    professionalLogger.error('❌ Redis Connection Failed', err, { correlationId });
    
    if (err.message.includes('ETIMEDOUT')) {
        professionalLogger.warn('💡 Tip: Check firewall rules/port 6379/rediss', { correlationId });
    } else if (err.message.includes('wrongpass')) {
        professionalLogger.warn('💡 Tip: Verify REDIS_URL password', { correlationId });
    } else if (err.message.includes('certificate')) {
        professionalLogger.warn('💡 Tip: Check SSL settings (?family=0)', { correlationId });
    }

    process.exit(1);
}

diagnoseRedis().catch((err: unknown) => {
     
    console.error('Fatal script error:', err);
    process.exit(1);
});
