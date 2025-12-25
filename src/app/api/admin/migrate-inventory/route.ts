import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest): Promise<Response> {
    try {
        console.log('🔄 بدء عملية النقل من API...');

        // تشغيل migration script
        const { spawn } = require('child_process');
        const path = require('path');

        const scriptPath = path.join(process.cwd(), 'scripts', 'migrate-inventory.js');

        return new Promise((resolve) => {
            // تمرير متغيرات البيئة للعملية الفرعية
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
                console.log('Migration output:', text);
                output += text;
            });

            migrationProcess.stderr.on('data', (data: Buffer) => {
                const text = data.toString();
                console.error('Migration error:', text);
                errorOutput += text;
            });

            migrationProcess.on('close', (code: number) => {
                console.log(`Migration process exited with code ${code}`);

                if (code === 0) {
                    resolve(NextResponse.json({
                        success: true,
                        message: 'Migration completed successfully',
                        output: output,
                        code: code
                    }));
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

            migrationProcess.on('error', (error: Error) => {
                console.error('Failed to start migration process:', error);
                resolve(NextResponse.json({
                    success: false,
                    error: 'Failed to start migration process',
                    details: error.message
                }, { status: 500 }));
            });
        });

    } catch (error) {
        console.error('Error in migration API:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

export async function GET() {
    try {
        // التحقق من حالة النقل السابقة
        const admin = (await import('firebase-admin')).default;

        // الحصول على Firebase admin instance
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
        console.error('Error checking migration status:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Failed to check migration status',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}
