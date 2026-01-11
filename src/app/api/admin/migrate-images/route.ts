import { NextResponse } from 'next/server';
import { logger } from '@/utils/logger';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeAdminApp } from '@/lib/firebase-admin';
import type { AdminRequest } from '@/lib/admin-middleware';
import { withSignedAdminAuth } from '@/lib/admin-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware';

export const POST = withSignedAdminAuth(withCsrfProtection(async (request: AdminRequest) => {
    try {
        await initializeAdminApp();
        const db = getFirestore();

        const snapshot = await db.collection('storeItems').get();
        const batch = db.batch();
        let updatedCount = 0;

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const currentImage = data.image as string;

            // If image is in root public (starts with / and doesn't start with /items/ or http)
            if (currentImage.startsWith('/') && !currentImage.startsWith('/items/') && !currentImage.startsWith('/libs/')) {
                const newPath = `/items${currentImage}`;
                batch.update(doc.ref, {
                    image: newPath,
                    updatedAt: new Date().toISOString()
                });
                updatedCount++;
            }
        });

        if (updatedCount > 0) {
            await batch.commit();
        }

        return NextResponse.json({
            success: true,
            message: `Successfully migrated ${updatedCount} item image paths`,
            updatedCount
        });
    } catch (error) {
        logger.error('Error migrating images:', error as Error);
        return NextResponse.json(
            { success: false, error: 'Failed to migrate images', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}));
