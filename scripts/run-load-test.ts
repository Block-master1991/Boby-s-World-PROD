/**
 * Production Load Test Suite - TypeScript Version
 * Simulates various traffic scenarios using Autocannon.
 * Verifies performance baseline and rate-limiting effectiveness.
 * Integrates with the professional logging system.
 */

import 'dotenv/config';
import autocannon from 'autocannon';
import { professionalLogger } from '../src/lib/logging';

const TARGET_URL = process.env.LOAD_TEST_URL || 'http://localhost:3000';

interface ScenarioResult {
    title: string;
    requests: number;
    duration: number;
    errors: number;
    timeouts: number;
    latency: {
        min: number;
        max: number;
        average: number;
        p99: number;
    };
    throughput: number;
}

async function runScenario(title: string, connections: number, duration: number, pipelining = 1): Promise<ScenarioResult> {
    const correlationId = `load-test-${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    
    professionalLogger.info(`🚀 Starting Load Test Scenario: ${title}`, { 
        correlationId,
        config: { connections, duration, pipelining, target: TARGET_URL }
    });

    return new Promise((resolve, reject) => {
        const instance = autocannon({
            url: `${TARGET_URL}/api/graphql`,
            connections,
            duration,
            pipelining,
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'user-agent': 'BobyWorld-LoadTester/2.0'
            },
            body: JSON.stringify({
                query: "query { marketData { bobyPrice volume24h } }" 
            }),
            excludeErrorStats: true
        }, (err, result) => {
            if (err) return reject(err);

            professionalLogger.info(`✅ Scenario ${title} Finished`, { 
                correlationId,
                avgLatency: `${result.latency.average}ms`,
                throughput: `${result.throughput.average} bytes/sec`
            });

            resolve({
                title,
                requests: result.requests.sent,
                duration: result.duration,
                errors: result.errors,
                timeouts: result.timeouts,
                latency: {
                    min: result.latency.min,
                    max: result.latency.max,
                    average: result.latency.average,
                    p99: result.latency.p99
                },
                throughput: result.throughput.average
            });
        });

        // Use autocannon's built-in progress tracking (output to stderr/stdout)
        autocannon.track(instance, { renderProgressBar: true });
    });
}

async function main() {
    const correlationId = `load-suite-${Date.now()}`;
    professionalLogger.info('🛡️  STARTING PRODUCTION LOAD TEST SUITE  🛡️', { correlationId });

    try {
        // 1. Baseline Test (Normal Traffic)
        const baseline = await runScenario('Baseline Traffic', 50, 10);

        // 2. Stress Test (Attack Simulation)
        const stress = await runScenario('Stress Test (Attack Flood)', 500, 10, 4);

        // Professional Reporting
        professionalLogger.info('📊 LOAD TEST SUITE REPORT GENERATED', { 
            correlationId,
            baseline: {
                status: baseline.latency.average < 200 ? '✅ PASSED' : '⚠️ HIGH LATENCY',
                avgLat: `${baseline.latency.average}ms`,
                errors: baseline.errors
            },
            stress: {
                status: stress.errors > 0 ? '✅ PASSED (Rate Limiter Active)' : '⚠️ WARNING (No Blocks Detected)',
                avgLat: `${stress.latency.average}ms`,
                errors: stress.errors
            }
        });

        process.exit(0);
    } catch (error: any) {
        professionalLogger.fatal('Load Test Suite execution failed', { 
            correlationId,
            error: error.message,
            hint: error.code === 'ECONNREFUSED' ? 'Is the server running on port 3000?' : undefined
        });
        process.exit(1);
    }
}

main();
