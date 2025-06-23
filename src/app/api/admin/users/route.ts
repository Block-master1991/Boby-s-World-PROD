import { NextResponse } from 'next/server';
import { db, initializeAdminApp } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';

export async function GET(request: Request) {
  try {
    // In a real application, you would add authentication/authorization here
    // to ensure only admins can access this endpoint.
    try {
      await initializeAdminApp(); // Ensure the admin app is initialized
    } catch (initError: any) {
      console.error('Firebase Admin SDK initialization failed:', initError);
      return NextResponse.json({
        error: 'Firebase Admin SDK initialization failed. Check server logs for details.',
        details: process.env.NODE_ENV === 'development' ? initError.message : undefined
      }, { status: 500 });
    }

    const playersRef = db.collection('players'); // Changed from 'users' to 'players'
    console.log('Attempting to fetch players from collection:', playersRef.path);
    const snapshot = await playersRef.get();
    const totalUsers = snapshot.size; // Renamed to totalUsers for consistency with frontend
    console.log('Total players fetched:', totalUsers);
    if (totalUsers === 0) {
      console.warn('No documents found in the "players" collection. Is the collection name correct or is it empty?');
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
    console.log('Online users:', onlineUsers);
    console.log('Offline users:', offlineUsers);

    return NextResponse.json({
      totalUsers,
      onlineUsers,
      offlineUsers,
    });
  } catch (error: any) {
    console.error('Error fetching user statistics:', error);
    // Log the full error object for more details
    console.error('Full error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    return NextResponse.json({
      error: 'Failed to fetch user statistics.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}
