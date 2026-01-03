/**
 * Security Test API - Run security tests
 * GET /api/security-test - Run all tests
 * GET /api/security-test?component=keyvault - Test specific component
 */

import { NextRequest, NextResponse } from 'next/server';
import { securityTestSuite } from '@/lib/securityTest';
import { SecurityScheduler } from '@/lib/security-scheduler';
import { logger } from 'utils/logger';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const component = searchParams.get('component');
        const runAll = searchParams.get('all') === 'true';
        const scheduled = searchParams.get('scheduled') === 'true';

        // Check authorization (in real application, verify user permissions)
        const isAuthorized = process.env.NODE_ENV === 'development' ||
            request.headers.get('x-admin-token') === process.env.ADMIN_TOKEN;

        if (!isAuthorized) {
            return NextResponse.json(
                { error: 'Not authorized to run security tests' },
                { status: 403 }
            );
        }

        logger.log('🔐 Starting security tests...');

        if (scheduled) {
            logger.log('⏰ Starting scheduled security tests...');
            const force = searchParams.get('force') === 'true';
            const result = await SecurityScheduler.runScheduledTests(force);

            return NextResponse.json({
                success: true,
                message: 'Security test scheduling executed',
                result
            });
        }

        if (runAll || !component) {
            // Run all tests
            const results = await securityTestSuite.runAllTests();
            const report = securityTestSuite.getReport();

            return NextResponse.json({
                success: true,
                message: 'All security tests completed',
                report,
                results
            });
        }

        // Run specific component test
        let specificResults: any[] = [];

        switch (component.toLowerCase()) {
            case 'keyvault':
                await (securityTestSuite as any).testKeyVault();
                break;
            case 'session':
                await (securityTestSuite as any).testSessionManager();
                break;
            case 'ratelimit':
                await (securityTestSuite as any).testRateLimiter();
                break;
            case 'integration':
                await (securityTestSuite as any).testSecurityIntegration();
                break;
            case 'performance':
                await (securityTestSuite as any).testPerformance();
                break;
            case 'security':
                await (securityTestSuite as any).testSecurity();
                break;
            default:
                return NextResponse.json(
                    { error: 'Unknown component. Available components: keyvault, session, ratelimit, integration, performance, security' },
                    { status: 400 }
                );
        }

        // Get results after execution
        const report = securityTestSuite.getReport();
        const componentResults = report.results.filter(r =>
            r.testName.toLowerCase().includes(component.toLowerCase())
        );

        return NextResponse.json({
            success: true,
            message: `Tests for ${component} completed`,
            component,
            results: componentResults,
            summary: {
                total: componentResults.length,
                passed: componentResults.filter(r => r.success).length,
                failed: componentResults.filter(r => !r.success).length
            }
        });

    } catch (error) {
        logger.error('Error running security tests:', error as Error);

        return NextResponse.json(
            {
                success: false,
                error: 'Failed to run security tests',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action } = body;

        if (action === 'cleanup') {
            // Clean up all security systems
            const { securityIntegration } = await import('@/lib/securityIntegration');
            securityIntegration.cleanup();

            return NextResponse.json({
                success: true,
                message: 'All security systems cleaned'
            });
        }

        if (action === 'reset') {
            // Reset test suite
            // In real application, can recreate instances

            return NextResponse.json({
                success: true,
                message: 'Test suite reset'
            });
        }

        return NextResponse.json(
            { error: 'Unknown action. Available actions: cleanup, reset' },
            { status: 400 }
        );

    } catch (error) {
        logger.error('Error in POST security-test:', error as Error);

        return NextResponse.json(
            {
                success: false,
                error: 'Error processing request',
                details: error instanceof Error ? error.message : 'Unknown error'
            },
            { status: 500 }
        );
    }
}
