
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/admin-middleware';
import type { AdminRequest } from '@/lib/admin-middleware';
import { auditLogger } from '@/lib/audit-logger';
import type { AuditSeverity } from '@/lib/audit-logger';
import { logger } from '@/utils/logger';

export const GET = withAdminAuth(async (request: AdminRequest) => {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const severity = searchParams.get('severity') as AuditSeverity | undefined;
        const userId = searchParams.get('userId') || undefined;

        // Fetch logs using the existing queryLogs method
        const logs = await auditLogger.queryLogs({
            severity,
            userId
        }, limit);

        // Serialize Firestore Timestamps to ISO strings for JSON response
        const serializedLogs = logs.map(log => ({
            ...log,
            timestamp: log.timestamp.toDate().toISOString() // Convert Timestamp to string
        }));

        return NextResponse.json({
            success: true,
            logs: serializedLogs,
            count: serializedLogs.length
        });
    } catch (error) {
        logger.error('Error fetching audit logs:', error as Error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to fetch audit logs',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
});
