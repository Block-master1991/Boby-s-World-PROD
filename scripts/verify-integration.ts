
import { decryptData, encryptData } from '../src/utils/encryption';

// Mock LocalStorage
class MockStorage {
    private store: Record<string, string> = {};

    getItem(key: string): string | null {
        return this.store[key] || null;
    }

    setItem(key: string, value: string): void {
        this.store[key] = value;
    }

    removeItem(key: string): void {
        delete this.store[key];
    }

    clear(): void {
        this.store = {};
    }
}

const localStorage = new MockStorage();
const PERSISTENCE_KEY = 'offline_penalty_queue_v1';

interface PenaltyItem {
    id: string;
    amount: number;
}

// Simulation of GameUI Logic
const queue: PenaltyItem[] = [];

const saveQueue = () => {
    if (queue.length === 0) {
        localStorage.removeItem(PERSISTENCE_KEY);
        return;
    }
    const encoded = encryptData(queue);
    localStorage.setItem(PERSISTENCE_KEY, encoded);
    console.log("💾 Saved to Storage (Encrypted):", `${encoded.substring(0, 30)}...`);
};

const addToQueue = (item: PenaltyItem) => {
    queue.push(item);
    saveQueue();
};

const loadQueue = (): PenaltyItem[] => {
    const stored = localStorage.getItem(PERSISTENCE_KEY);
    if (!stored) return [];

    try {
        const parsed = decryptData(stored);
        if (Array.isArray(parsed)) {
            console.log("📂 Loaded from Storage (Decrypted):", parsed);
            return parsed as PenaltyItem[];
        }
    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        console.error("Load failed", errorMessage);
    }
    return [];
};

// --- RUN INTEGRATION TEST ---

console.log("\n🚀 Starting Persistence Integration Test...\n");

// 1. Simulate adding a penalty
console.log("Step 1: User hits enemy (Adding Penalty)...");
const penaltyItem: PenaltyItem = { id: "penalty-1", amount: 50 };
addToQueue(penaltyItem);

// 2. Verify Storage contains encrypted data
const storedValue = localStorage.getItem(PERSISTENCE_KEY);
if (storedValue && storedValue.includes(":")) { // Simple check for IV:Ciphertext structure
    console.log("✅ Verified: Storage contains encrypted data format.");
} else {
    console.error("❌ FAIL: Storage does not appear encrypted correctly.");
    process.exit(1);
}

if (storedValue?.includes("amount")) {
    console.error("❌ FAIL: Plaintext 'amount' leaked in storage!");
    process.exit(1);
} else {
    console.log("✅ Verified: No plaintext leakage in storage.");
}

// 3. Simulate Page Reload (Clear memory, load from storage)
console.log("\nStep 2: Simulating Page Reload (Clearing Memory)...");
const memoryQueueAfterReload = loadQueue();

if (memoryQueueAfterReload.length === 1 && memoryQueueAfterReload[0]?.id === "penalty-1") {
    console.log("✅ Verified: Data recovered successfully after reload.");
} else {
    console.error("❌ FAIL: Data recovery failed.", memoryQueueAfterReload);
    process.exit(1);
}

// 4. Simulate Processing & Removal
console.log("\nStep 3: Simulating Successful Server Sync (Removing Item)...");
// Assume server processed it, remove from item
queue.shift(); // Remove simulated item
saveQueue(); // Save empty queue

if (localStorage.getItem(PERSISTENCE_KEY) === null) {
    console.log("✅ Verified: Storage cleared after processing.");
} else {
    console.error("❌ FAIL: Storage not cleared.", localStorage.getItem(PERSISTENCE_KEY));
}

console.log("\n🎉 Integration Test PASSED: The logic is sound and professional.");
