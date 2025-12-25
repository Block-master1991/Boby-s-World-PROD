import { NextRequest, NextResponse } from 'next/server';
import { createStoreItem, getAllStoreItems } from '@/lib/server-items';

export async function GET() {
    try {
        const items = await getAllStoreItems();
        return NextResponse.json({
            success: true,
            items,
            count: items.length,
        });
    } catch (error) {
        console.error('Error fetching store items:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to fetch store items',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
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
            name: body.name,
            description: body.description,
            price: body.price || 0,
            usdPrice: body.usdPrice || 0.001,
            image: body.image,
            dataAiHint: body.dataAiHint || '',
            type: body.type || 'consumable',
            rarity: body.rarity || 'common',
        });

        return NextResponse.json({
            success: true,
            message: 'Item created successfully',
            item: newItem,
        });
    } catch (error) {
        console.error('Error creating store item:', error);

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
}
