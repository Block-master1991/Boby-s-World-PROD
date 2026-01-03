/**
 * Email Service - Email sending service
 * Handles sending emails for account recovery and security alerts.
 */

import { logger } from '@/utils/logger';

export interface EmailOptions {
    to: string;
    subject: string;
    text: string;
    html?: string;
}

export class EmailService {
    private static instance: EmailService;
    private readonly apiKey = process.env.RESEND_API_KEY;
    private readonly fromEmail = process.env.FROM_EMAIL || 'security@boby.world';

    private constructor() { }

    public static getInstance(): EmailService {
        if (!EmailService.instance) {
            EmailService.instance = new EmailService();
        }
        return EmailService.instance;
    }

    /**
     * Sends a recovery email with the provided code.
     */
    public async sendRecoveryEmail(to: string, code: string): Promise<boolean> {
        const subject = 'Boby World - Account Recovery Code';
        const text = `Your account recovery code is: ${code}. This code will expire in 1 hour. If you did not request this, please ignore this email.`;
        const html = `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
                <h2>Boby World Account Recovery</h2>
                <p>You requested an account recovery. Use the code below to reset your passkeys:</p>
                <div style="font-size: 24px; font-weight: bold; padding: 20px; background: #f4f4f4; border-radius: 8px; text-align: center; letter-spacing: 5px;">
                    ${code}
                </div>
                <p>This code will expire in 1 hour.</p>
                <p style="color: #666; font-size: 12px; margin-top: 20px;">
                    If you did not request this, please ignore this email or contact support if you have concerns.
                </p>
            </div>
        `;

        return this.sendEmail({ to, subject, text, html });
    }

    /**
     * Generic email sending method.
     * Integrates with Resend API if API key is present, otherwise logs to console.
     */
    private async sendEmail(options: EmailOptions): Promise<boolean> {
        if (!this.apiKey) {
            logger.log('--- [DEVELOPMENT] Email Outbox ---');
            logger.log(`To: ${options.to}`);
            logger.log(`Subject: ${options.subject}`);
            logger.log(`Body: ${options.text}`);
            logger.log('--- [Set RESEND_API_KEY to send real emails] ---');
            return true;
        }

        try {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    from: this.fromEmail,
                    to: options.to,
                    subject: options.subject,
                    text: options.text,
                    html: options.html
                })
            });

            if (!response.ok) {
                const error = await response.json();
                logger.error('[EmailService] API Error:', error);
                return false;
            }

            return true;
        } catch (error) {
            logger.error('[EmailService] Network Error:', error);
            return false;
        }
    }
}

export const emailService = EmailService.getInstance();
