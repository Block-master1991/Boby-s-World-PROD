import { NextResponse } from 'next/server';
import { initializeStoreItemsInFirestore } from '@/lib/server-items';

export async function GET() {
  try {
    await initializeStoreItemsInFirestore();
    return NextResponse.json({ message: 'Store items initialization process started. Check server logs for details.' });
  } catch (error) {
    console.error("Error initializing store items via API:", error);
    return NextResponse.json({ error: 'Failed to initialize store items.' }, { status: 500 });
  }
}
