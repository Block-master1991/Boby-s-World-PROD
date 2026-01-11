import { NextResponse } from 'next/server';
import { logger } from '@/utils/logger';
import { initializeStoreItemsInFirestore } from '@/lib/server-items';
import type { AdminRequest } from '@/lib/admin-middleware';
import { withAdminAuth } from '@/lib/admin-middleware';

export const GET = withAdminAuth(async (request: AdminRequest) => {
  try {
    await initializeStoreItemsInFirestore();
    return NextResponse.json({ message: 'Store items initialization process started. Check server logs for details.' });
  } catch (error) {
    logger.error("Error initializing store items via API:", error as Error);
    return NextResponse.json({ error: 'Failed to initialize store items.' }, { status: 500 });
  }
});
