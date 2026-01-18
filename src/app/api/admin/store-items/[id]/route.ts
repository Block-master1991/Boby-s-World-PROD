import type { AdminRequest } from '@/lib/admin-middleware';
import { withAdminAuth, withSignedAdminAuth } from '@/lib/admin-middleware';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { deleteStoreItem, getStoreItemById, updateStoreItem } from '@/lib/server-items';
import type { StoreItemDocument } from '@/types/database';
import { NextResponse } from 'next/server';
import { logger } from 'utils/logger';

interface RouteParams {
    params: Promise<{
        id: string;
    }>;
}

export const GET = withAdminAuth(async (_request: AdminRequest, { params }: RouteParams) => {
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

type UpdateBody = Partial<Pick<StoreItemDocument, 'name' | 'description' | 'price' | 'image' | 'dataAiHint' | 'type' | 'rarity' | 'isActive'>>;

function validateUpdateFields(body: UpdateBody) {
    const requiredFields = ['name', 'description', 'image'] as const;
    for (const field of requiredFields) {
        if (!body[field]) return field;
    }
    return null;
}

export const PUT = withSignedAdminAuth(withCsrfProtection(async (request: AdminRequest, { params }: RouteParams) => {
    try {
        const { id: itemId } = await params;
        const body = (await request.json()) as UpdateBody;

        if (!itemId) return NextResponse.json({ success: false, error: 'Item ID is required' }, { status: 400 });

        const missingField = validateUpdateFields(body);
        if (missingField) return NextResponse.json({ success: false, error: `Missing required field: ${missingField}` }, { status: 400 });

        const updatedItem = await updateStoreItem(itemId, {
            name: body['name'] as string,
            description: body['description'] as string,
            price: (body['price'] as number) || 0,
            image: body['image'] as string,
            dataAiHint: (body['dataAiHint'] as string) || '',
            type: (body['type'] as 'consumable' | 'permanent') || 'consumable',
            rarity: (body['rarity'] as 'common' | 'rare' | 'epic' | 'legendary') || 'common',
            isActive: body['isActive'] !== undefined ? Boolean(body['isActive']) : true,
        });

        const response = NextResponse.json({ success: true, message: 'Item updated successfully', item: updatedItem });
        return await setCsrfTokenResponse(response, request.user.sub, request.headers.get('host') || undefined);
    } catch (error) {
        logger.error('Error updating store item:', error as Error);
        const isNotFound = error instanceof Error && error.message.includes('not found');
        return NextResponse.json(
            { success: false, error: isNotFound ? 'Item not found' : 'Failed to update store item', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: isNotFound ? 404 : 500 }
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
