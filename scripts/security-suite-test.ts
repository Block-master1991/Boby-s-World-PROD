/**
 * Security Suite Test Runner
 * Runs the main SecurityTestSuite to verify all security components
 */

import { securityTestSuite } from '../src/tests/utils/securityTest';

async function runSecurityTests() {
    console.log('🧪 Starting Integrated Security Suite Tests...');

    try {
        await securityTestSuite.runAllTests();
        const report = securityTestSuite.getReport();

        console.log('\n📊 Security Test Report:');
        console.log(`Total: ${report.summary.total}`);
        console.log(`Passed: ${report.summary.passed}`);
        console.log(`Failed: ${report.summary.failed}`);
        console.log(`Duration: ${report.summary.duration}ms`);

        if (report.recommendations.length > 0) {
            console.log('\n💡 Recommendations:');
            report.recommendations.forEach(rec => console.log(`- ${rec}`));
        }

        if (report.summary.failed > 0) {
            console.error('\n❌ Some security tests failed!');
            process.exit(1);
        } else {
            console.log('\n✅ All security tests in the suite passed!');
        }
    } catch (error) {
        console.error('\n❌ Error running security tests:');
        console.error(error);
        process.exit(1);
    }
}

runSecurityTests();
