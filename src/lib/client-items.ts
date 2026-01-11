'use client';
import { logger } from 'utils/logger';

/**
 * Client-safe functions for store items
 * These functions are safe to use in client-side components
 * They use GraphQL or API routes instead of direct Firebase admin calls
 */

import type { StoreItemDefinition } from './server-items';

// ===== Client-safe functions for store items =====

/**
 * Get all store items from database via GraphQL
 */
export async function getStoreItems(): Promise<StoreItemDefinition[]> {
    try {
        // Get CSRF token from cookies
        const csrfToken = document?.cookie?.split('; ')?.find(row => row.startsWith('csrfToken='))?.split('=')[1];

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        const response = await fetch('/api/graphql', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                query: `
                    query {
                        storeItems {
                            id
                            name
                            description
                            price
                            image
                            type
                            rarity
                            isActive
                            createdAt
                            updatedAt
                        }
                    }
                `
            })
        });

        const result = await response.json();
        return result.data?.storeItems || [];
    } catch (error) {
        logger.error('Error fetching store items:', error);
        return [];
    }
}

/**
 * Get active store items only from database via GraphQL
 */
export async function getStoreItemsActive(): Promise<StoreItemDefinition[]> {
    try {
        // Get CSRF token from cookies
        const csrfToken = document?.cookie?.split('; ')?.find(row => row.startsWith('csrfToken='))?.split('=')[1];

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        const response = await fetch('/api/graphql', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                query: `
                    query {
                        activeStoreItems {
                            id
                            name
                            description
                            price
                            image
                            type
                            rarity
                            isActive
                            createdAt
                            updatedAt
                        }
                    }
                `
            })
        });

        const result = await response.json();
        return result.data?.activeStoreItems || [];
    } catch (error) {
        logger.error('Error fetching active store items:', error);
        return [];
    }
}

/**
 * Get a single store item by ID from database via GraphQL
 */
export async function getStoreItem(id: string): Promise<StoreItemDefinition | null> {
    try {
        // Get CSRF token from cookies
        const csrfToken = document?.cookie?.split('; ')?.find(row => row.startsWith('csrfToken='))?.split('=')[1];

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }

        const response = await fetch('/api/graphql', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                query: `
                    query($id: ID!) {
                        storeItem(id: $id) {
                            id
                            name
                            description
                            price
                            image
                            type
                            rarity
                            isActive
                            createdAt
                            updatedAt
                        }
                    }
                `,
                variables: { id }
            })
        });

        const result = await response.json();
        return result.data?.storeItem || null;
    } catch (error) {
        logger.error('Error fetching store item:', error);
        return null;
    }
}

// ===== Re-export types =====
export type { StoreItemDefinition };
