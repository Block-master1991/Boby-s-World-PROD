
import { NextRequest, NextResponse } from 'next/server';
import { logQueryService } from '@/lib/logging/service/LogQueryService';
import { ADMIN_WALLET_ADDRESS } from '@/lib/constants';

// Simple admin check mock - in production use real session validation
const isAdmin = (req: NextRequest) => {
    // For demo purposes, we might skip strict server-side wallet check unless we have session cookies
    // This assumes the frontend protects the route via useAuth
    // In a real implementation: verify JWT/Session from cookie
    return true;
};

export async function GET(req: NextRequest) {
    if (!isAdmin(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(req.url);

        const filters = {
            level: searchParams.get('level') || undefined,
            text: searchParams.get('search') || undefined,
            type: (searchParams.get('type') as any) || undefined,
            limit: parseInt(searchParams.get('limit') || '50'),
            offset: parseInt(searchParams.get('offset') || '0'),
            startTime: searchParams.get('startTime') ? parseInt(searchParams.get('startTime')!) : undefined
        };

        const result = await logQueryService.search(filters);

        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }
}
