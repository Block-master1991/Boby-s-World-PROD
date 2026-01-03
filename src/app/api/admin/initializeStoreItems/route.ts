import { NextResponse } from 'next/server';
import { logger } from '@/utils/logger';
import { initializeStoreItemsInFirestore } from '@/lib/server-items';

import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware';

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    await initializeStoreItemsInFirestore();
    return NextResponse.json({ message: 'Store items initialization process started. Check server logs for details.' });
  } catch (error) {
    logger.error("Error initializing store items via API:", error as Error);
    return NextResponse.json({ error: 'Failed to initialize store items.' }, { status: 500 });
  }
});
