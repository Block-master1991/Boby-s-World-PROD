import { AdvancedRateLimiter } from "../../lib/advancedRateLimiter";
import { sessionManager } from "../../lib/advancedSessionManager";
import { keyVault } from "../../lib/keyVaultService";
import { securityIntegration } from "../../lib/securityIntegration";
import type { SecurityTestSuite } from "./securityTest";

// Helper for type safety in tests
// Using loose type for internal mock to avoid heavy deps, casting when needed
// interface MockRequest { ... } - Removed unused interface

// Define the shape of device info to allow cleaner types than 'any'
export interface DeviceInfo {
  userAgent: string;
  language: string;
  platform: string;
  timezone: string;
  screenResolution: string;
  colorDepth: number;
  hardwareConcurrency: number;
  deviceMemory: number;
  touchPoints: number;
  plugins: string[];
  canvas: string;
  webgl: string;
  fonts: string[];
  audioContext: string;
  battery: string;
  networkInfo: string;
  [key: string]: unknown; // Allow extensions for tests
}

export async function runKeyVaultTests(runner: SecurityTestSuite) {
  // Test key creation
  await runner.runTest("KeyVault - Create Secure Key", async () => {
    const keyId = `test-key-${Date.now()}`;
    await keyVault.createSecureKey(keyId);
    const key = await keyVault.getSecureKey(keyId);
    if (!key) throw new Error("Failed to retrieve key");
    return { keyId, keyRetrieved: true };
  });

  // Test key rotation
  await runner.runTest("KeyVault - Key Rotation", async () => {
    const keyId = `rotate-test-${Date.now()}`;
    await keyVault.createSecureKey(keyId);

    await keyVault.rotateKey(keyId);
    const rotatedKey = await keyVault.getSecureKey(keyId);

    if (!rotatedKey) throw new Error("Failed to retrieve key after rotation");
    return { rotated: true, keyId };
  });

  // Test KeyVault statistics
  await runner.runTest("KeyVault - Statistics", () => {
    const stats = keyVault.getStats();
    if (typeof stats.activeKeys !== "number") throw new Error("Invalid statistics");
    return Promise.resolve(stats);
  });
}

export async function runSessionTests(runner: SecurityTestSuite, getMockDevice: () => DeviceInfo) {
  const testDeviceInfo = getMockDevice();

  await runner.runTest("SessionManager - Create Session", async () => {
    const session = await sessionManager.createSecureSession("test-user", testDeviceInfo);
    if (!session) throw new Error("Failed to create session");
    return { sessionId: session.sessionId, userId: session.userId };
  });

  await runner.runTest("SessionManager - Validate Session", async () => {
    const session = await sessionManager.createSecureSession("test-user-2", testDeviceInfo);
    if (!session) throw new Error("Failed to create session");
    const validation = await sessionManager.validateSession(
      session.sessionId,
      testDeviceInfo,
      "127.0.0.1"
    );
    if (!validation.valid) throw new Error("Failed to validate session");
    return { valid: true, sessionId: session.sessionId };
  });

  await runner.runTest("SessionManager - Statistics", async () => {
    const stats = await sessionManager.getSessionStats();
    if (typeof stats.totalSessions !== "number") throw new Error("Invalid statistics");
    return stats;
  });
}

export async function runRateLimiterTests(
  runner: SecurityTestSuite,
  getMockDevice: () => DeviceInfo
) {
  const rateLimiter = AdvancedRateLimiter.getInstance();
  // Use Partial<Request> or similar pattern if we had the Request type available,
  // but for now we construct the minimum compatible object and cast.
  const mockRequest = {
    headers: new Map([
      ["user-agent", "Test Browser"],
      ["x-forwarded-for", "127.0.0.1"],
    ]),
    url: "http://localhost/api/test",
  };
  const deviceInfo = getMockDevice();

  await runner.runTest("RateLimiter - Normal Request", async () => {
    // We cast mockRequest to unknown then Request to bypass type matching
    const result = await rateLimiter.checkRateLimit(
      mockRequest as unknown as Request,
      "test-user",
      { endpoint: "/api/test", deviceInfo }
    );
    if (!result.allowed) throw new Error("Normal request rejected");
    return { allowed: true, limit: result.limit };
  });

  await runner.runTest("RateLimiter - Statistics", () => {
    const stats = rateLimiter.getStats();
    if (typeof stats.activeIdentifiers !== "number") throw new Error("Invalid statistics");
    return Promise.resolve(stats);
  });
}

export async function runSecurityIntegrationTests(runner: SecurityTestSuite) {
  await runner.runTest("SecurityIntegration - Create Key", async () => {
    const success = await securityIntegration.createSecureKey(`integration-test-${Date.now()}`);
    if (!success) throw new Error("Failed to create key");
    return { created: true };
  });

  await runner.runTest("SecurityIntegration - Encryption/Decryption", async () => {
    const testData = "This is a test message for encryption";
    const encrypted = await securityIntegration.encryptData(testData);
    const decrypted = await securityIntegration.decryptData(encrypted);
    if (decrypted !== testData) throw new Error("Encryption/Decryption failed");
    return { original: testData, decrypted, success: true };
  });

  await runner.runTest("SecurityIntegration - Comprehensive Statistics", async () => {
    const stats = await securityIntegration.getSecurityStats();
    if (!stats.keyVault || !stats.sessions || !stats.rateLimiting)
      throw new Error("Incomplete statistics");
    return stats;
  });
}

export async function runPerformanceTests(
  runner: SecurityTestSuite,
  getMockDevice: () => DeviceInfo
) {
  await runner.runTest(
    "Performance - Key Creation",
    async () => {
      const startTime = Date.now();
      const keysToCreate = 5;
      for (let i = 0; i < keysToCreate; i++) {
        // eslint-disable-next-line no-await-in-loop
        await keyVault.createSecureKey(`perf-test-${i}-${Date.now()}`);
      }
      return { duration: Date.now() - startTime, keysCreated: keysToCreate };
    },
    5000
  );

  await runner.runTest(
    "Performance - Session Management",
    async () => {
      const startTime = Date.now();
      const deviceInfo = getMockDevice();
      const sessionsToCreate = 3;
      for (let i = 0; i < sessionsToCreate; i++) {
        // eslint-disable-next-line no-await-in-loop
        const session = await sessionManager.createSecureSession(`perf-user-${i}`, deviceInfo);
        if (session) {
          // eslint-disable-next-line no-await-in-loop
          await sessionManager.expireSession(session.sessionId);
        }
      }
      return { duration: Date.now() - startTime, sessionsCreated: sessionsToCreate };
    },
    30000
  );
}

export async function runSecurityTests(runner: SecurityTestSuite, getMockDevice: () => DeviceInfo) {
  await runRepeatedRequestsTest(runner);
  await runEncryptionTest(runner);
  await runSessionProtectionTest(runner, getMockDevice);
  await runSessionRevocationTest(runner, getMockDevice);
}

async function runRepeatedRequestsTest(runner: SecurityTestSuite) {
  await runner.runTest("Security - Protection Against Repeated Requests", async () => {
    const rateLimiter = AdvancedRateLimiter.getInstance();
    const mockRequest = {
      headers: new Map([
        ["user-agent", "Attack Bot"],
        ["x-forwarded-for", "192.168.1.1"],
      ]),
      url: "http://localhost/api/test",
    };

    let blockedRequests = 0;
    const testRequests = 20;
    for (let i = 0; i < testRequests; i++) {
      // eslint-disable-next-line no-await-in-loop
      const result = await rateLimiter.checkRateLimit(
        mockRequest as unknown as Request,
        "attack-user",
        { endpoint: "/api/attack" }
      );
      if (!result.allowed) blockedRequests++;
    }
    if (blockedRequests === 0) throw new Error("Suspicious requests were not blocked");
    return { blockedRequests, totalRequests: testRequests };
  });
}

async function runEncryptionTest(runner: SecurityTestSuite) {
  await runner.runTest("Security - Encryption Integrity", async () => {
    const sensitiveData = "This is highly sensitive information";
    const encrypted1 = await securityIntegration.encryptData(sensitiveData, "security-test");
    const encrypted2 = await securityIntegration.encryptData(sensitiveData, "security-test");

    let warning: string | undefined;
    if (encrypted1 === encrypted2) {
      warning = "Encryption produces same result - may not be secure";
    }

    const decrypted1 = await securityIntegration.decryptData(encrypted1, "security-test");
    const decrypted2 = await securityIntegration.decryptData(encrypted2, "security-test");

    if (decrypted1 !== sensitiveData || decrypted2 !== sensitiveData)
      throw new Error("Failed to decrypt data correctly");
    return { encryptionConsistent: true, dataIntegrity: true, warning };
  });
}

async function runSessionProtectionTest(
  runner: SecurityTestSuite,
  getMockDevice: () => DeviceInfo
) {
  await runner.runTest("Security - Session Protection", async () => {
    const deviceInfo1 = getMockDevice();
    deviceInfo1.userAgent = "Browser 1";

    const deviceInfo2 = { ...deviceInfo1, userAgent: "Browser 2", canvas: "canvas2" };
    const session = await sessionManager.createSecureSession("security-user", deviceInfo1);
    if (!session) throw new Error("Failed to create secure session");

    const validation1 = await sessionManager.validateSession(
      session.sessionId,
      deviceInfo1,
      "127.0.0.1"
    );
    const validation2 = await sessionManager.validateSession(
      session.sessionId,
      deviceInfo2,
      "127.0.0.1"
    );

    if (!validation1.valid) throw new Error("Failed to validate original device");
    await sessionManager.expireSession(session.sessionId);

    return {
      originalDeviceValid: validation1.valid,
      differentDeviceValid: validation2.valid,
      sessionProtection: !validation2.valid,
    };
  });
}

async function runSessionRevocationTest(
  runner: SecurityTestSuite,
  getMockDevice: () => DeviceInfo
) {
  await runner.runTest("Security - Session Revocation", async () => {
    const deviceInfo = getMockDevice();
    const session = await sessionManager.createSecureSession("revoke-user", deviceInfo);
    if (!session) throw new Error("Failed to create session");

    await sessionManager.expireAllUserSessions("revoke-user");
    const validation = await sessionManager.validateSession(
      session.sessionId,
      deviceInfo,
      "127.0.0.1"
    );

    if (validation.valid) throw new Error("Session revocation failed");
    return { revoked: true, userId: "revoke-user" };
  });
}
