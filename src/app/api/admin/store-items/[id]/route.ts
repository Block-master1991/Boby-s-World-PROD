import { NextResponse } from 'next/server';
import { logger } from 'utils/logger';
import { getStoreItemById, updateStoreItem, deleteStoreItem } from '@/lib/server-items';
import type { AdminRequest } from '@/lib/admin-middleware';
import { withAdminAuth, withSignedAdminAuth } from '@/lib/admin-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';

interface RouteParams {
    params: Promise<{
        id: string;
    }>;
}

export const GET = withAdminAuth(async (request: AdminRequest, { params }: RouteParams) => {
    try {
        const resolvedParams = await params;
        const itemId = resolvedParams.id;

        if (!itemId) {
            return NextResponse.json(
                { success: false, error: 'Item ID is required' },
                { status: 400 }
            );
        }

        const item = await getStoreItemById(itemId);

        if (!item) {
            return NextResponse.json(
                { success: false, error: 'Item not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            item,
        });
    } catch (error) {
        logger.error('Error fetching store item:', error as Error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to fetch store item',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
});

export const PUT = withSignedAdminAuth(withCsrfProtection(async (request: AdminRequest, { params }: RouteParams) => {
    try {
        const resolvedParams = await params;
        const itemId = resolvedParams.id;
        const body = await request.json();

        if (!itemId) {
            return NextResponse.json(
                { success: false, error: 'Item ID is required' },
                { status: 400 }
            );
        }

        // Validate required fields for update
        const requiredFields = ['name', 'description', 'image'];
        for (const field of requiredFields) {
            if (!body[field]) {
                return NextResponse.json(
                    { success: false, error: `Missing required field: ${field}` },
                    { status: 400 }
                );
            }
        }

        // Update the item
        const updatedItem = await updateStoreItem(itemId, {
            name: body.name,
            description: body.description,
            price: body.price || 0,
            image: body.image,
            dataAiHint: body.dataAiHint || '',
            type: body.type || 'consumable',
            rarity: body.rarity || 'common',
            isActive: body.isActive !== undefined ? body.isActive : true,
        });

        const response = NextResponse.json({
            success: true,
            message: 'Item updated successfully',
            item: updatedItem,
        });

        const requestHost = request.headers.get('host') || undefined;
        return await setCsrfTokenResponse(response, request.user.sub, requestHost);
    } catch (error) {
        logger.error('Error updating store item:', error as Error);

        if (error instanceof Error && error.message.includes('not found')) {
            return NextResponse.json({ success: false, error: 'Item not found' }, { status: 404 });
        }

        return NextResponse.json(
            {
                success: false,
                error: 'Failed to update store item',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}));

export const DELETE = withSignedAdminAuth(withCsrfProtection(async (request: AdminRequest, { params }: RouteParams) => {
    try {
        const resolvedParams = await params;
        const itemId = resolvedParams.id;

        if (!itemId) {
            return NextResponse.json(
                { success: false, error: 'Item ID is required' },
                { status: 400 }
            );
        }

        // Delete the item
        await deleteStoreItem(itemId);

        const response = NextResponse.json({
            success: true,
            message: 'Item deleted successfully',
        });

        const requestHost = request.headers.get('host') || undefined;
        return await setCsrfTokenResponse(response, request.user.sub, requestHost);
    } catch (error) {
        logger.error('Error deleting store item:', error as Error);

        if (error instanceof Error && error.message.includes('not found')) {
            return NextResponse.json({ success: false, error: 'Item not found' }, { status: 404 });
        }

        return NextResponse.json(
            {
                success: false,
                error: 'Failed to delete store item',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}));
