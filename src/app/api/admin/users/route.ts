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

    const usersRef = db.collection('users');
    console.log('Attempting to fetch users from collection:', usersRef.path);
    const snapshot = await usersRef.get();
    const totalUsers = snapshot.size;
    console.log('Total users fetched:', totalUsers);
    if (totalUsers === 0) {
      console.warn('No documents found in the "users" collection. Is the collection name correct or is it empty?');
    }

    const now = Date.now();
    const onlineThreshold = 5 * 60 * 1000; // 5 minutes

    let onlineUsers = 0;
    snapshot.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
      const userData = doc.data();
      // console.log(`User ${doc.id} lastOnline:`, userData.lastOnline?.toDate?.().toLocaleString()); // Log each user's lastOnline
      if (userData.lastOnline && (now - userData.lastOnline.toDate().getTime() < onlineThreshold)) {
        onlineUsers++;
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
