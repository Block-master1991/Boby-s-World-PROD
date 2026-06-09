/**
 * Security Test API - Run security tests
 * GET /api/security-test - Run all tests
 * GET /api/security-test?component=keyvault - Test specific component
 */

import { isDev } from "@/lib/config/env";
import { SecurityScheduler } from "@/lib/security/security-scheduler";
import { securityTestSuite } from "@/tests/utils/securityTest";
import { type NextRequest, NextResponse } from "next/server";
import { logger } from "utils/logger";

// -- Helper Functions --

function checkAuthorization(request: NextRequest): boolean {
  return isDev || request.headers.get("x-admin-token") === process.env["ADMIN_TOKEN"];
}

// Fixed: Removed async as it just returns the promise
function runComponentTest(component: string): Promise<void> {
  switch (component.toLowerCase()) {
    case "keyvault":
      return securityTestSuite.testKeyVault();
    case "session":
      return securityTestSuite.testSessionManager();
    case "ratelimit":
      return securityTestSuite.testRateLimiter();
    case "integration":
      return securityTestSuite.testSecurityIntegration();
    case "performance":
      return securityTestSuite.testPerformance();
    case "security":
      return securityTestSuite.testSecurity();
    default:
      throw new Error(`Unknown component: ${component}`);
  }
}

function formatResponse(component: string) {
  const report = securityTestSuite.getReport();
  const results = report.results.filter(r =>
    r.testName.toLowerCase().includes(component.toLowerCase())
  );

  return NextResponse.json({
    success: true,
    message: `Tests for ${component} completed`,
    component,
    results,
    summary: {
      total: results.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    },
  });
}

// -- Main Handler --

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const component = searchParams.get("component");
    const scheduled = searchParams.get("scheduled") === "true";

    if (!checkAuthorization(request)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    if (scheduled) {
      const result = await SecurityScheduler.runScheduledTests(
        searchParams.get("force") === "true"
      );
      return NextResponse.json({ success: true, message: "Scheduled tests executed", result });
    }

    logger.log("🔐 Starting security tests...");

    if (searchParams.get("all") === "true" || !component) {
      const results = await securityTestSuite.runAllTests();
      return NextResponse.json({
        success: true,
        message: "All tests completed",
        report: securityTestSuite.getReport(),
        results,
      });
    }

    try {
      await runComponentTest(component);
      return formatResponse(component);
    } catch {
      return NextResponse.json(
        {
          error:
            "Unknown component. Available: keyvault, session, ratelimit, integration, performance, security",
        },
        { status: 400 }
      );
    }
  } catch (error) {
    logger.error("Error running tests:", error as Error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to run tests",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();
    if (action === "cleanup") {
      const { securityIntegration } = await import("@/lib/security/securityIntegration");
      securityIntegration.cleanup();
      return NextResponse.json({ success: true, message: "Systems cleaned" });
    }
    if (action === "reset")
      return NextResponse.json({ success: true, message: "Test suite reset" });
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    logger.error("POST Error:", error as Error);
    return NextResponse.json({ success: false, error: "Request failed" }, { status: 500 });
  }
}
