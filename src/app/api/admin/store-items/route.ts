import { NextResponse } from 'next/server';
import { logger } from '@/utils/logger';
import { createStoreItem, getAllStoreItems } from '@/lib/server-items';
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware';
import { withSignedAdminAuth, AdminRequest } from '@/lib/admin-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';

export const GET = withAuth(async (request: AuthenticatedRequest) => {
    try {
        const items = await getAllStoreItems();
        return NextResponse.json({
            success: true,
            items,
            count: items.length,
        });
    } catch (error) {
        logger.error('Error fetching store items:', error as Error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to fetch store items',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
});

export const POST = withSignedAdminAuth(withCsrfProtection(async (request: AdminRequest) => {
    try {
        const body = await request.json();

        // Validate required fields
        const requiredFields = ['name', 'description', 'image'];
        for (const field of requiredFields) {
            if (!body[field]) {
                return NextResponse.json(
                    {
                        success: false,
                        error: `Missing required field: ${field}`,
                    },
                    { status: 400 }
                );
            }
        }

        // Create the item
        const newItem = await createStoreItem({
            id: body.id,
            name: body.name,
            description: body.description,
            price: body.price || 0,
            image: body.image,
            dataAiHint: body.dataAiHint || '',
            type: body.type || 'consumable',
            rarity: body.rarity || 'common',
        });

        const response = NextResponse.json({
            success: true,
            message: 'Item created successfully',
            item: newItem,
        });

        // Use unified helper to update CSRF
        const requestHost = request.headers.get('host') || undefined;
        return await setCsrfTokenResponse(response, request.user.sub, requestHost);
    } catch (error) {
        logger.error('Error creating store item:', error as Error);

        // Handle duplicate ID error
        if (error instanceof Error && error.message.includes('already exists')) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'An item with this ID already exists',
                },
                { status: 409 }
            );
        }

        return NextResponse.json(
            {
                success: false,
                error: 'Failed to create store item',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}));
