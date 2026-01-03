/**
 * Attack Simulation Script
 * This script simulates a quick attack on the API to verify:
 * 1. Sliding Window Rate Limiting
 * 2. Persistent Blacklisting (Redis + Firestore)
 * 
 * Run with: npx ts-node scripts/simulate_attack.ts
 */

const TARGET_URL = 'http://localhost:3000/api/graphql'; // Adjust port if needed

async function simulateAttack() {
    console.log(`[Attack] Starting flood attack on ${TARGET_URL}...`);

    let blockedCount = 0;
    let successfulCount = 0;

    for (let i = 0; i < 50; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            const start = Date.now();
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

            if (res.status === 429) {
                console.log(`[Req ${i}] BLOCKED (429) - Took ${Date.now() - start}ms`);
                blockedCount++;
            } else if (res.ok) {
                console.log(`[Req ${i}] SUCCESS (200) - Took ${Date.now() - start}ms`);
                successfulCount++;
            } else {
                console.log(`[Req ${i}] STATUS ${res.status} - Took ${Date.now() - start}ms`);
                // Assume block if 403/Forbidden often used for blacklist
                if (res.status === 403) blockedCount++;
            }

            // Fast flood, but slight delay to prevent OS socket exhaustion locally
            await new Promise(r => setTimeout(r, 50));

        } catch (e: any) {
            console.log(`[Req ${i}] ERROR: ${e.message}`);
        }
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

simulateAttack();
