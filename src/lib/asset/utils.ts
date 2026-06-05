import { logger } from "utils/logger";
import type { IntegrityReport } from "./types";

/**
 * Calculate SHA-256 hash for ArrayBuffer
 */
export async function calculateSHA256(data: ArrayBuffer): Promise<string> {
  try {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    return hashHex;
  } catch (error) {
    logger.error("[AssetUtils] Failed to calculate SHA-256:", error);
    throw error;
  }
}

/**
 * Format integrity report for display
 */
export function formatIntegrityReport(report: IntegrityReport): string {
  const passRate =
    report.totalChecked > 0 ? ((report.passed / report.totalChecked) * 100).toFixed(1) : "0.0";

  let output = `
=== Asset Integrity Report ===
Timestamp: ${new Date(report.timestamp).toLocaleString()}
Total Checked: ${report.totalChecked}
Passed: ${report.passed} (${passRate}%)
Failed: ${report.failed}
`;

  if (report.failed > 0) {
    output += "\n--- Failed Assets ---\n";
    report.checks
      .filter(c => !c.isValid)
      .forEach(check => {
        output += `- ${check.path}: ${check.error}\n`;
      });
  }

  return output;
}

/**
 * Batch promises to limit concurrency
 */
export async function batchPromises<T, R>(
  items: T[],
  factory: (item: T) => Promise<R>,
  batchSize: number = 5
): Promise<R[]> {
  const results: R[] = [];
  /* eslint-disable no-await-in-loop */
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(factory));
    results.push(...batchResults);
  }
  /* eslint-enable no-await-in-loop */
  return results;
}
