import type { AdminRequest } from "@/lib/admin-middleware";
import { withAdminAuth } from "@/lib/admin-middleware";
import type { AuditSeverity } from "@/lib/logging/audit-logger";
import { auditLogger } from "@/lib/logging/audit-logger";
import { logger } from "@/utils/logger";
import { NextResponse } from "next/server";

export const GET = withAdminAuth(async (request: AdminRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const filters: { severity?: AuditSeverity; userId?: string } = {};

    const severityParam = searchParams.get("severity");
    if (severityParam) {
      filters.severity = severityParam as AuditSeverity;
    }

    const userIdParam = searchParams.get("userId");
    if (userIdParam) {
      filters.userId = userIdParam;
    }

    // Fetch logs using the existing queryLogs method
    const logs = await auditLogger.queryLogs(filters, limit);

    // Serialize Firestore Timestamps to ISO strings for JSON response
    const serializedLogs = logs.map(log => ({
      ...log,
      timestamp: log.timestamp.toDate().toISOString(), // Convert Timestamp to string
    }));

    return NextResponse.json({
      success: true,
      logs: serializedLogs,
      count: serializedLogs.length,
    });
  } catch (error) {
    logger.error("Error fetching audit logs:", error as Error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch audit logs",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
});
