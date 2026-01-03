
import { NextRequest, NextResponse } from 'next/server';
import { logQueryService } from '@/lib/logging/service/LogQueryService';

export async function GET(req: NextRequest) {
    // Basic admin check (should be improved)
    // Same logic as logs route

    try {
        const stats = await logQueryService.getStats();
        return NextResponse.json(stats);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
    }
}
