import { NextResponse } from 'next/server';
import { logger } from '@/utils/logger';
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware';
import { withSignedAdminAuth, AdminRequest } from '@/lib/admin-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';

export const POST = withSignedAdminAuth(withCsrfProtection(async (request: AdminRequest) => {
    try {
        logger.log('🔄 Starting migration process from API...');

        // Run migration script
        const { spawn } = require('child_process');
        const path = require('path');

        const scriptPath = path.join(process.cwd(), 'scripts', 'migrate-inventory.js');

        return new Promise((resolve) => {
            // Pass environment variables to child process
            const envVars = {
                ...process.env,
                FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
                FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
                FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
            };

            const migrationProcess = spawn('node', [scriptPath], {
                stdio: ['inherit', 'pipe', 'pipe'],
                cwd: process.cwd(),
                env: envVars
            });

            let output = '';
            let errorOutput = '';

            migrationProcess.stdout.on('data', (data: Buffer) => {
                const text = data.toString();
                logger.log('Migration output:', text);
                output += text;
            });

            migrationProcess.stderr.on('data', (data: Buffer) => {
                const text = data.toString();
                logger.error('Migration error:', new Error(text));
                errorOutput += text;
            });

            migrationProcess.on('close', (code: number) => {
                logger.log(`Migration process exited with code ${code}`);

                if (code === 0) {
                    const response = NextResponse.json({
                        success: true,
                        message: 'Migration completed successfully',
                        output: output,
                        code: code
                    });

                    // Use unified helper to update CSRF
                    const requestHost = request.headers.get('host') || undefined;
                    resolve(setCsrfTokenResponse(response, request.user.sub, requestHost));
                } else {
                    resolve(NextResponse.json({
                        success: false,
                        error: 'Migration failed',
                        output: output,
                        errorOutput: errorOutput,
                        code: code
                    }, { status: 500 }));
                }
            });

            migrationProcess.on('error', (error: any) => {
                logger.error('Failed to start migration process:', error as Error);
                resolve(NextResponse.json({
                    success: false,
                    error: 'Failed to start migration process',
                    details: error.message
                }, { status: 500 }));
            });
        });

    } catch (error) {
        logger.error('Error in migration API:', error as Error);
        return NextResponse.json(
            {
                success: false,
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}));

export const GET = withAuth(async (request: AuthenticatedRequest) => {
    try {
        // Check previous migration status
        const admin = (await import('firebase-admin')).default;

        // Get Firebase admin instance
        const { initializeAdminApp } = await import('@/lib/firebase-admin');
        await initializeAdminApp();
        const db = admin.firestore();

        const migrationDoc = await db.collection('system').doc('inventory-migration-v2').get();

        if (migrationDoc.exists) {
            const data = migrationDoc.data();
            return NextResponse.json({
                success: true,
                hasMigrationRun: true,
                migrationData: data
            });
        } else {
            return NextResponse.json({
                success: true,
                hasMigrationRun: false,
                message: 'No migration has been run yet'
            });
        }

    } catch (error) {
        logger.error('Error checking migration status:', error as Error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to check migration status',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
});
