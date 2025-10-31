/**
 * Email Summarizer Service
 * Fetches recent emails and generates AI summaries
 */

const Anthropic = require('@anthropic-ai/sdk');
const GmailProvider = require('./gmail-provider');

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Fetch and summarize recent emails
 * @param {number} userId - User ID
 * @param {Object} options - Options
 * @param {number} options.maxEmails - Maximum number of emails to fetch (default: 5)
 * @param {string} options.query - Gmail query filter (default: 'in:inbox')
 * @returns {Promise<Object>} Summary result
 */
async function summarizeRecentEmails(userId, options = {}) {
    const { maxEmails = 5, query = 'in:inbox' } = options;

    console.log(`[Email Summarizer] Fetching ${maxEmails} recent emails for user ${userId}`);

    try {
        // 1. Initialize Gmail provider
        const gmailProvider = new GmailProvider(userId);
        await gmailProvider.initialize();

        // 2. Fetch recent emails
        const emails = await gmailProvider.readEmails({
            query,
            maxResults: maxEmails,
            labelIds: ['INBOX']
        });

        console.log(`[Email Summarizer] Fetched ${emails.length} emails`);

        if (emails.length === 0) {
            return {
                success: true,
                summary: {
                    title: 'No Recent Emails',
                    description: 'Your inbox is empty or no emails match the criteria.',
                    emailCount: 0,
                    emails: []
                }
            };
        }

        // 3. Format emails for AI
        const emailsText = emails.map((email, index) => {
            return `
Email ${index + 1}:
From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}
Preview: ${email.snippet || email.body.substring(0, 200)}
---
`.trim();
        }).join('\n\n');

        console.log(`[Email Summarizer] Sending ${emails.length} emails to Claude for summarization`);

        // 4. Generate summary using Claude
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: `Please analyze these ${emails.length} recent emails and provide:
1. A brief title summarizing the overall theme
2. A concise summary (2-3 sentences) of the key information across all emails
3. Any important action items or deadlines mentioned

Here are the emails:

${emailsText}

Respond in this JSON format:
{
  "title": "Brief title here",
  "summary": "2-3 sentence summary here",
  "actionItems": ["action 1", "action 2"]
}`
            }]
        });

        const content = response.content[0].text;
        console.log(`[Email Summarizer] Received summary from Claude`);

        // 5. Parse AI response
        let aiSummary;
        try {
            // Try to extract JSON from the response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                aiSummary = JSON.parse(jsonMatch[0]);
            } else {
                // Fallback if no JSON found
                aiSummary = {
                    title: 'Email Summary',
                    summary: content,
                    actionItems: []
                };
            }
        } catch (parseError) {
            console.warn('[Email Summarizer] Failed to parse AI JSON, using raw content');
            aiSummary = {
                title: 'Email Summary',
                summary: content,
                actionItems: []
            };
        }

        // 6. Build final summary
        const summary = {
            title: aiSummary.title || 'Email Summary',
            description: buildDescription(aiSummary, emails),
            emailCount: emails.length,
            emails: emails.map(e => ({
                from: e.from,
                subject: e.subject,
                date: e.date,
                snippet: e.snippet
            })),
            actionItems: aiSummary.actionItems || []
        };

        console.log(`[Email Summarizer] ✓ Summary generated: "${summary.title}"`);

        return {
            success: true,
            summary
        };

    } catch (error) {
        console.error('[Email Summarizer] Error:', error.message);
        throw error;
    }
}

/**
 * Build detailed description from AI summary
 */
function buildDescription(aiSummary, emails) {
    let description = aiSummary.summary || 'Summary of recent emails.';

    // Add action items if present
    if (aiSummary.actionItems && aiSummary.actionItems.length > 0) {
        description += '\n\nAction items:\n';
        aiSummary.actionItems.forEach(item => {
            description += `• ${item}\n`;
        });
    }

    // Add email list
    description += `\n\nEmails reviewed (${emails.length}):\n`;
    emails.forEach((email, index) => {
        description += `${index + 1}. ${email.subject} - from ${email.from}\n`;
    });

    return description.trim();
}

module.exports = {
    summarizeRecentEmails
};
