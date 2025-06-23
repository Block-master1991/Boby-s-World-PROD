import axios from 'axios';

export async function sendSlackAlert(message: string): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
if (!webhookUrl) {
  console.warn('SLACK_WEBHOOK_URL is not set.');
  return false;
}
  try {
    await axios.post(webhookUrl, { text: message });
    return true;
  } catch (err) {
    console.error('Failed to send Slack alert:', err);
    return false;
  }
}