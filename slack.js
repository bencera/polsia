const { IncomingWebhook } = require('@slack/webhook');
require('dotenv').config();

class SlackNotificationService {
    constructor() {
        this.webhookUrl = process.env.SLACK_WEBHOOK_URL;
        this.enabled = process.env.SLACK_NOTIFICATIONS_ENABLED === 'true';

        if (this.enabled && this.webhookUrl) {
            this.webhook = new IncomingWebhook(this.webhookUrl);
            console.log('✅ Slack notifications initialized');
        } else if (this.enabled) {
            console.warn('⚠️  Slack notifications enabled but SLACK_WEBHOOK_URL not configured');
        }
    }

    async send(message, options = {}) {
        if (!this.enabled) {
            console.log('Slack notification (disabled):', typeof message === 'string' ? message : message.text);
            return { success: false, reason: 'notifications disabled' };
        }

        if (!this.webhook) {
            console.error('Slack webhook not configured');
            return { success: false, reason: 'webhook not configured' };
        }

        try {
            const payload = typeof message === 'string'
                ? { text: message, ...options }
                : { ...message, ...options };

            await this.webhook.send(payload);
            console.log('✅ Slack notification sent successfully');
            return { success: true };
        } catch (error) {
            console.error('❌ Failed to send Slack notification:', error.message);
            return { success: false, error: error.message };
        }
    }

    async notifyWaitlistSignup(email) {
        const message = {
            text: `New waitlist signup: ${email}`,
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: '🎉 New Waitlist Signup!'
                    }
                },
                {
                    type: 'section',
                    fields: [
                        {
                            type: 'mrkdwn',
                            text: `*Email:*\n${email}`
                        },
                        {
                            type: 'mrkdwn',
                            text: `*Time:*\n${new Date().toLocaleString()}`
                        }
                    ]
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: '🤖 Polsia Autonomous System'
                        }
                    ]
                }
            ]
        };

        return this.send(message);
    }
}

// Export singleton instance
const slackService = new SlackNotificationService();
module.exports = slackService;
