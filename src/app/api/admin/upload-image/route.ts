import type { AdminRequest } from '@/lib/admin-middleware';
import { withAdminAuth, withSignedAdminAuth } from '@/lib/admin-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { logger } from '@/utils/logger';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { NextResponse } from 'next/server';
import { join } from 'path';

export const POST = withAdminAuth(withCsrfProtection(async (request: AdminRequest) => {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json(
                { success: false, error: 'No file uploaded' },
                { status: 400 }
            );
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Path to public/items
        const uploadDir = join(process.cwd(), 'public', 'items');

        // Ensure directory exists
        try {
            await mkdir(uploadDir, { recursive: true });
        } catch {
            // Directory might already exist
        }

        // Clean filename to prevent security issues
        const filename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const path = join(uploadDir, filename);

        await writeFile(path, buffer);
        logger.log(`File uploaded to ${path}`);

        return NextResponse.json({
            success: true,
            url: `/items/${filename}`,
            filename: filename
        });
    } catch (error) {
        logger.error('Error uploading file:', error as Error);
        return NextResponse.json(
            { success: false, error: 'Failed to upload file' },
            { status: 500 }
        );
    }
}));

// Optional: DELETE handler if we want to delete orphan images
export const DELETE = withSignedAdminAuth(withCsrfProtection(async (request: AdminRequest) => {
    try {
        const { searchParams } = new URL(request.url);
        const filename = searchParams.get('filename');

        if (!filename) {
            return NextResponse.json(
                { success: false, error: 'Filename is required' },
                { status: 400 }
            );
        }

        // Security check: ensure filename doesn't contain path traversal
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return NextResponse.json(
                { success: false, error: 'Invalid filename' },
                { status: 400 }
            );
        }

        const path = join(process.cwd(), 'public', 'items', filename);
        await unlink(path);

        return NextResponse.json({
            success: true,
            message: 'File deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting file:', error as Error);
        // If file doesn't exist, we still consider it a success
        return NextResponse.json({
            success: true,
            message: 'File already deleted or not found'
        });
    }
}));
