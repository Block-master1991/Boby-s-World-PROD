import { NextResponse } from 'next/server';
import { logQueryService } from '@/lib/logging/service/LogQueryService';
import type { AdminRequest } from '@/lib/admin-middleware';
import { withAdminAuth } from '@/lib/admin-middleware';

export const GET = withAdminAuth(async (request: AdminRequest) => {
    try {
        const stats = await logQueryService.getStats();
        return NextResponse.json(stats);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
    }
});
