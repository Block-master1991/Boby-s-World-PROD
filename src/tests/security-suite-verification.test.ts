import { securityIntegration } from "../lib/securityIntegration";
import { securityTestSuite } from "./utils/securityTest";

jest.mock("../lib/slack-alert", () => ({
  sendSlackAlert: jest.fn().mockResolvedValue(true),
}));

// Polyfill setImmediate for gRPC/Firebase in Jest environment
if (typeof setImmediate === "undefined") {
  (global as any).setImmediate = (fn: Function, ...args: any[]) => setTimeout(fn, 0, ...args);
}

/**
 * Security Suite Verification Test
 * Runs the full security test suite within the Jest environment.
 */
describe("Security Verification Suite", () => {
  // Increase timeout for the full suite
  jest.setTimeout(600000);

  // Cleanup before and after to ensure clean environment
  beforeAll(async () => {
    await securityIntegration.cleanup();
  });

  afterAll(async () => {
    await securityIntegration.cleanup();
  });


  it("should run all security tests successfully", async () => {
    // Run the suite
    const results = await securityTestSuite.runAllTests();
    const report = securityTestSuite.getReport();

    console.log("Security Test Report:", JSON.stringify(report.summary, null, 2));

    // Assertions
    expect(report.summary.failed).toBe(0);
    expect(report.summary.passed).toBeGreaterThan(0);
    expect(results.every(r => r.success)).toBe(true);
  });
});
