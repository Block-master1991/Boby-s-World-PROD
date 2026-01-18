/**
 * Attack Simulation Script
 * This script simulates a quick attack on the API to verify:
 * 1. Sliding Window Rate Limiting
 * 2. Persistent Blacklisting (Redis + Firestore)
 * 
 * Run with: npx ts-node scripts/simulate_attack.ts
 */

const TARGET_URL = 'http://localhost:3000/api/graphql'; // Adjust port if needed

function logRequestResult(index: number, status: number | string, duration: number) {
    console.log(`[Req ${index}] ${typeof status === 'number' && status === 429 ? 'BLOCKED' : 'STATUS'} (${status}) - Took ${duration}ms`);
}

async function performAttackRequest(index: number) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const start = Date.now();
    try {
        const res = await fetch(TARGET_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'AttackBot/1.0', // This triggers bot detection too
            },
            body: JSON.stringify({ query: "{ hello }" }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const duration = Date.now() - start;

        if (res.status === 429) {
            logRequestResult(index, 429, duration);
            return { blocked: true, success: false };
        } 
        
        if (res.ok) {
            console.log(`[Req ${index}] SUCCESS (200) - Took ${duration}ms`);
            return { blocked: false, success: true };
        }

        logRequestResult(index, res.status, duration);
        return { blocked: res.status === 403, success: false };

    } catch (error: unknown) {
        clearTimeout(timeoutId);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`[Req ${index}] ERROR: ${errorMessage}`);
        return { blocked: false, success: false };
    }
}

async function simulateAttack() {
    console.log(`[Attack] Starting flood attack on ${TARGET_URL}...`);

    let blockedCount = 0;
    let successfulCount = 0;

    for (let i = 0; i < 50; i++) {
        // eslint-disable-next-line no-await-in-loop
        const result = await performAttackRequest(i);
        if (result.blocked) blockedCount++;
        if (result.success) successfulCount++;

        // Fast flood, but slight delay to prevent OS socket exhaustion locally
        // eslint-disable-next-line no-await-in-loop
        await new Promise(r => setTimeout(r, 50));
    }

    console.log('\n--- Simulation Results ---');
    console.log(`Successful: ${successfulCount}`);
    console.log(`Blocked: ${blockedCount}`);

    if (blockedCount > 0) {
        console.log('✅ Rate Limiting is ACTIVE.');
    } else {
        console.error('❌ Rate Limiting FAILED to block requests.');
    }
}

simulateAttack().catch(err => {
    console.error('Simulation failed:', err);
    process.exit(1);
});
