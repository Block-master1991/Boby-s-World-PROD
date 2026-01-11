import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { logQueryService } from '@/lib/logging/service/LogQueryService';
import type { AdminRequest } from '@/lib/admin-middleware';
import { withAdminAuth } from '@/lib/admin-middleware';

export const GET = withAdminAuth(async (request: AdminRequest) => {
    try {
        const { searchParams } = new URL(request.url);

        const filters = {
            level: searchParams.get('level') || undefined,
            text: searchParams.get('search') || undefined,
            type: (searchParams.get('type') as 'audit' | 'performance' | 'business' | 'app') || undefined,
            limit: parseInt(searchParams.get('limit') || '50'),
            offset: parseInt(searchParams.get('offset') || '0'),
            startTime: searchParams.get('startTime') ? parseInt(searchParams.get('startTime')!) : undefined
        };

        const result = await logQueryService.search(filters);

        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }
});
