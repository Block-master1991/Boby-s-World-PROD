import type { AdminRequest } from '@/lib/admin-middleware';
import { withAdminAuth } from '@/lib/admin-middleware';
import type { LogQueryFilters } from '@/lib/logging/service/LogQueryService';
import { logQueryService } from '@/lib/logging/service/LogQueryService';
import { logger } from '@/utils/logger';
import { NextResponse } from 'next/server';

export const GET = withAdminAuth(async (request: AdminRequest) => {
    try {
        const { searchParams } = new URL(request.url);

        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = parseInt(searchParams.get('offset') || '0');

        const filters: LogQueryFilters = { limit, offset };

        const level = searchParams.get('level');
        if (level) filters.level = level;

        const text = searchParams.get('search');
        if (text) filters.text = text;

        const type = searchParams.get('type');
        if (type && ['audit', 'performance', 'business', 'app'].includes(type)) {
            filters.type = type as 'audit' | 'performance' | 'business' | 'app';
        }

        const startTime = searchParams.get('startTime');
        if (startTime) filters.startTime = parseInt(startTime);

        const result = await logQueryService.search(filters);

        return NextResponse.json(result);
    } catch (error) {
        logger.error('Failed to fetch logs:', error instanceof Error ? error.message : String(error));
        return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }
});
