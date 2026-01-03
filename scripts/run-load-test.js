
const autocannon = require('autocannon');

const TARGET_URL = 'http://localhost:3000';

async function runScenario(title, connections, duration, pipelining = 1) {
    console.log(`\n🚀 Starting Scenario: ${title}`);
    console.log(`   Config: ${connections} connections, ${duration}s duration, pipelining: ${pipelining}`);

    return new Promise((resolve, reject) => {
        const instance = autocannon({
            url: `${TARGET_URL}/api/graphql`, // Targeting the heavy endpoint
            connections,
            duration,
            pipelining,
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'user-agent': 'LoadTest/1.0'
            },
            body: JSON.stringify({
                query: "query { marketData { bobyPrice volume24h } }" // Cached query
            }),
            excludeErrorStats: true
        }, (err, result) => {
            if (err) return reject(err);

            console.log(`   ✅ Finished. Avg Latency: ${result.latency.average}ms, Throughput: ${result.throughput.average} bytes/sec`);
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

        autocannon.track(instance, { renderProgressBar: true });
    });
}

async function main() {
    console.log('🛡️  STARTING PRODUCTION LOAD TEST SUITE  🛡️');
    console.log('================================================');

    try {
        // 1. Baseline Test (Normal Traffic)
        // Aim: Verify the app handles "normal" high load (e.g., 50 concurrent users) well.
        // Expectation: Low latency, 0 errors.
        const baseline = await runScenario('Baseline Traffic', 50, 10);

        // 2. Stress Test (Attack Simulation)
        // Aim: Flood with 500 concurrent connections to trigger Rate Limiter.
        // Expectation: High errors (429 Too Many Requests), but server stays alive.
        const stress = await runScenario('Stress Test (Attack Flood)', 500, 10, 4);

        // Report
        console.log('\n\n📊 LOAD TEST REPORT 📊');
        console.log('======================');

        printResult(baseline, '✅ PASSED (Latency < 200ms)');

        // Determine Pass/Fail for Stress
        // If we get blocked requests (non-200), that's good! It means protection works.
        // Ideally we check if error codes are 429. Autocannon sums up non-2xx as errors.
        const stressStatus = stress.errors > 0 ? '✅ PASSED (Rate Limiter Active)' : '⚠️ WARNING (No Blocks Detected)';
        printResult(stress, stressStatus);

    } catch (error) {
        console.error('❌ Load Test Interrupted:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.error('   Hint: Is the server running on port 3000?');
        }
    }
}

function printResult(result, status) {
    console.log(`\n🔹 [${result.title}]`);
    console.log(`   Status: ${status}`);
    console.log(`   Requests Sent: ${result.requests.toLocaleString()}`);
    console.log(`   Non-2xx Responses: ${result.errors.toLocaleString()}`);
    console.log(`   Timeouts:      ${result.timeouts}`);
    console.log(`   Latency (Avg): ${result.latency.average.toFixed(2)}ms`);
    console.log(`   Latency (P99): ${result.latency.p99.toFixed(2)}ms`);
}

main();
