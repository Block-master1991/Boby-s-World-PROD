import { NextResponse } from 'next/server';
import { logger } from '@/utils/logger';
import { db, initializeAdminApp } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';

import { withAdminAuth, AdminRequest } from '@/lib/admin-middleware';

export const GET = withAdminAuth(async (request: AdminRequest) => {
  try {
    // In a real application, you would add authentication/authorization here
    // to ensure only admins can access this endpoint.
    try {
      await initializeAdminApp(); // Ensure the admin app is initialized
    } catch (initError) {
      logger.error('Firebase Admin SDK initialization failed:', initError as Error);
      const errorMessage = initError instanceof Error ? initError.message : 'An unknown error occurred';
      return NextResponse.json({
        error: 'Firebase Admin SDK initialization failed. Check server logs for details.',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      }, { status: 500 });
    }

    const playersRef = db.collection('players'); // Changed from 'users' to 'players'
    logger.log('Attempting to fetch players from collection:', playersRef.path);
    const snapshot = await playersRef.get();
    const totalUsers = snapshot.size; // Renamed to totalUsers for consistency with frontend
    logger.log('Total players fetched:', totalUsers);
    if (totalUsers === 0) {
      logger.warn('No documents found in the "players" collection. Is the collection name correct or is it empty?');
    }

    const now = Date.now();
    const onlineThreshold = 30 * 1000; // 30 seconds for online status

    let onlineUsers = 0;
    snapshot.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
      const userData = doc.data();
      if (userData.lastInteraction && typeof userData.lastInteraction.toDate === 'function') {
        const lastInteractionTime = userData.lastInteraction.toDate().getTime();
        if (now - lastInteractionTime < onlineThreshold) {
          onlineUsers++;
        }
      }
    });

    const offlineUsers = totalUsers - onlineUsers;
    logger.log('Online users:', onlineUsers);
    logger.log('Offline users:', offlineUsers);

    return NextResponse.json({
      totalUsers,
      onlineUsers,
      offlineUsers,
    });
  } catch (error) {
    logger.error('Error fetching user statistics:', error as Error);
    // Log the full error object for more details
    logger.error('Full error details:', new Error(JSON.stringify(error, Object.getOwnPropertyNames(error))));
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({
      error: 'Failed to fetch user statistics.',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    }, { status: 500 });
  }
});
