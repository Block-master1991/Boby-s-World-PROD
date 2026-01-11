/**
 * Slack Integration Diagnostic - TypeScript Version
 * Verifies that the Slack webhook integration is working correctly.
 * Integrates with the professional logging system.
 */

import 'dotenv/config';
import axios from 'axios';
import { professionalLogger } from '../src/lib/logging';

async function testSlack() {
    const correlationId = `slack-test-${Date.now()}`;
    const url = process.env.SLACK_WEBHOOK_URL;

    if (!url) {
        professionalLogger.fatal('SLACK_WEBHOOK_URL is missing in environment variables', { correlationId });
        process.exit(1);
    }

    professionalLogger.info(`✅ SLACK_WEBHOOK_URL found: ${url.substring(0, 30)}...`, { correlationId });

    const payload = {
        blocks: [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "🐾 Boby World Security Check",
                    emoji: true
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: "This is a *professional diagnostic alert* to verify your Slack integration is working correctly."
                }
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: `*Status:* Online | *Time:* ${new Date().toISOString()}`
                    }
                ]
            }
        ]
    };

    try {
        professionalLogger.info('📡 Sending test payload to Slack...', { correlationId });
        const response = await axios.post(url, payload);
        
        if (response.status === 200) {
            professionalLogger.info('✅ Success! Check your Slack channel.', { correlationId });
            process.exit(0);
        } else {
            professionalLogger.warn('⚠️ Slack returned a non-success status', { 
                correlationId, 
                status: response.status 
            });
            process.exit(1);
        }
    } catch (error: any) {
        professionalLogger.fatal('Failed to send Slack alert', { 
            correlationId,
            error: error.message,
            responseData: error.response?.data
        });
        process.exit(1);
    }
}

testSlack();
