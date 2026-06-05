/**
 * Production Load Test Suite - TypeScript Version
 * Simulates various traffic scenarios using Autocannon.
 * Verifies performance baseline and rate-limiting effectiveness.
 * Integrates with the professional logging system.
 */

import autocannon, {
  type Options as AutocannonOptions,
  type Result as AutocannonResult,
} from "autocannon";
import "dotenv/config";
import { professionalLogger } from "../src/lib/logging";

const TARGET_URL = process.env["LOAD_TEST_URL"] || "http://localhost:3000";

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

interface LoadTestScenario {
  title: string;
  connections: number;
  duration: number;
  pipelining?: number;
}

// Remove async as it just returns a Promise directly
function runScenario(config: LoadTestScenario): Promise<ScenarioResult> {
  const correlationId = `load-test-${config.title.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;
  const pipelining = config.pipelining || 1;

  professionalLogger.info(`🚀 Starting Load Test Scenario: ${config.title}`, {
    correlationId,
    config: { ...config, pipelining, target: TARGET_URL },
  });

  return new Promise((resolve, reject) => {
    const options = buildAutocannonConfig(config, pipelining);

    const instance = autocannon(options, (err, result) => {
      if (err) return reject(err);
      handleScenarioComplete(resolve, result, config.title, correlationId);
    });

    autocannon.track(instance, { renderProgressBar: true });
  });
}

function buildAutocannonConfig(config: LoadTestScenario, pipelining: number): AutocannonOptions {
  return {
    url: `${TARGET_URL}/api/graphql`,
    connections: config.connections,
    duration: config.duration,
    pipelining,
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "BobyWorld-LoadTester/2.0",
    },
    body: JSON.stringify({
      query: "query { marketData { bobyPrice volume24h } }",
    }),
    excludeErrorStats: true,
  };
}

function handleScenarioComplete(
  resolve: (value: ScenarioResult) => void,
  result: AutocannonResult,
  title: string,
  correlationId: string
) {
  professionalLogger.info(`✅ Scenario ${title} Finished`, {
    correlationId,
    avgLatency: `${result.latency.average}ms`,
    throughput: `${result.throughput.average} bytes/sec`,
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
      p99: result.latency.p99,
    },
    throughput: result.throughput.average,
  });
}

async function main() {
  const correlationId = `load-suite-${Date.now()}`;
  professionalLogger.info("🛡️  STARTING PRODUCTION LOAD TEST SUITE  🛡️", { correlationId });

  try {
    const baseline = await runScenario({
      title: "Baseline Traffic",
      connections: 50,
      duration: 10,
    });
    const stress = await runScenario({
      title: "Stress Test (Attack Flood)",
      connections: 500,
      duration: 10,
      pipelining: 4,
    });

    logFinalReport(correlationId, baseline, stress);
    process.exit(0);
  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    professionalLogger.fatal("Load Test Suite execution failed", {
      correlationId,
      error: err.message,
      hint: err.code === "ECONNREFUSED" ? "Is the server running on port 3000?" : undefined,
    });
    process.exit(1);
  }
}

function logFinalReport(correlationId: string, baseline: ScenarioResult, stress: ScenarioResult) {
  professionalLogger.info("📊 LOAD TEST SUITE REPORT GENERATED", {
    correlationId,
    baseline: {
      status: baseline.latency.average < 200 ? "✅ PASSED" : "⚠️ HIGH LATENCY",
      avgLat: `${baseline.latency.average}ms`,
      errors: baseline.errors,
    },
    stress: {
      status:
        stress.errors > 0 ? "✅ PASSED (Rate Limiter Active)" : "⚠️ WARNING (No Blocks Detected)",
      avgLat: `${stress.latency.average}ms`,
      errors: stress.errors,
    },
  });
}

main();
