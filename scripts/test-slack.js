
require('dotenv').config({ path: '.env.local' });
const axios = require('axios');

async function testSlack() {
    const url = process.env.SLACK_WEBHOOK_URL;

    if (!url) {
        console.error('❌ SLACK_WEBHOOK_URL is missing in .env.local');
        process.exit(1);
    }

    console.log(`✅ SLACK_WEBHOOK_URL found: ${url.substring(0, 30)}...`);

    const payload = {
        blocks: [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "� Boby's World Security Check",
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
        console.log('📡 Sending test payload to Slack...');
        const response = await axios.post(url, payload);
        if (response.status === 200) {
            console.log('✅ Success! Check your Slack channel.');
        } else {
            console.log(`⚠️ Slack returned status: ${response.status}`);
        }
    } catch (e) {
        console.error('❌ Failed to send alert:');
        if (e.response) {
            console.error(`   Status: ${e.response.status}`);
            console.error(`   Data: ${JSON.stringify(e.response.data)}`);
        } else {
            console.error(`   Error: ${e.message}`);
        }
        process.exit(1);
    }
}

testSlack();
