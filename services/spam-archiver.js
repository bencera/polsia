/**
 * Spam Archiver Service
 * Analyzes recent emails and archives promotional spam
 */

const Anthropic = require('@anthropic-ai/sdk');
const GmailProvider = require('./gmail-provider');

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Analyze and archive spam emails
 * @param {number} userId - User ID
 * @param {Object} options - Options
 * @param {number} options.maxEmails - Maximum number of emails to check (default: 10)
 * @returns {Promise<Object>} Archive result
 */
async function analyzeAndArchiveSpam(userId, options = {}) {
    const { maxEmails = 10 } = options;

    console.log(`[Spam Archiver] Checking ${maxEmails} recent emails for user ${userId}`);

    try {
        // 1. Initialize Gmail provider
        const gmailProvider = new GmailProvider(userId);
        await gmailProvider.initialize();

        // 2. Fetch recent inbox emails
        const emails = await gmailProvider.readEmails({
            query: 'in:inbox',
            maxResults: maxEmails,
            labelIds: ['INBOX']
        });

        console.log(`[Spam Archiver] Fetched ${emails.length} emails`);

        if (emails.length === 0) {
            return {
                success: true,
                result: {
                    totalChecked: 0,
                    archivedCount: 0,
                    archivedEmails: [],
                    keptEmails: []
                }
            };
        }

        // 3. Prepare emails for AI analysis
        const emailsForAnalysis = emails.map((email, index) => ({
            index: index + 1,
            id: email.id,
            from: email.from,
            subject: email.subject,
            snippet: email.snippet,
            body: email.body.substring(0, 500) // First 500 chars for analysis
        }));

        const emailsText = JSON.stringify(emailsForAnalysis, null, 2);

        console.log(`[Spam Archiver] Sending ${emails.length} emails to Claude for spam analysis`);

        // 4. Use Claude to identify spam
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 2048,
            messages: [{
                role: 'user',
                content: `Analyze these ${emails.length} emails and identify which ones are CLEARLY promotional/marketing spam.

Look for these indicators:
- Unsubscribe links
- Marketing language (Sale!, Discount!, Limited offer!, Buy now!)
- Newsletter-style content
- Promotional headers
- Mass marketing characteristics
- Commercial advertisements

IMPORTANT: Only mark emails as spam if they are OBVIOUSLY promotional. When in doubt, keep the email.

Emails to analyze:
${emailsText}

Respond in this JSON format:
{
  "spamEmails": [1, 3, 5],
  "reasoning": "Brief explanation for each spam email"
}

Return ONLY the email indices (numbers) that are spam in the spamEmails array.`
            }]
        });

        const content = response.content[0].text;
        console.log(`[Spam Archiver] Received spam analysis from Claude`);

        // 5. Parse AI response
        let analysis;
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                analysis = JSON.parse(jsonMatch[0]);
            } else {
                console.warn('[Spam Archiver] No JSON found in response, treating all as non-spam');
                analysis = { spamEmails: [], reasoning: 'Could not parse response' };
            }
        } catch (parseError) {
            console.warn('[Spam Archiver] Failed to parse AI JSON:', parseError.message);
            analysis = { spamEmails: [], reasoning: 'Parse error' };
        }

        const spamIndices = analysis.spamEmails || [];
        console.log(`[Spam Archiver] Claude identified ${spamIndices.length} spam emails:`, spamIndices);

        // 6. Archive spam emails
        const archivedEmails = [];
        const keptEmails = [];

        for (let i = 0; i < emails.length; i++) {
            const email = emails[i];
            const emailIndex = i + 1;

            if (spamIndices.includes(emailIndex)) {
                // This is spam - archive it
                try {
                    console.log(`[Spam Archiver] Archiving email ${emailIndex}: "${email.subject}"`);

                    // Remove INBOX label to archive
                    await gmailProvider.removeLabelFromMessage(email.id, 'INBOX');

                    archivedEmails.push({
                        subject: email.subject,
                        from: email.from,
                        date: email.date
                    });
                } catch (archiveError) {
                    console.error(`[Spam Archiver] Failed to archive email ${emailIndex}:`, archiveError.message);
                }
            } else {
                // Keep in inbox
                keptEmails.push({
                    subject: email.subject,
                    from: email.from
                });
            }
        }

        console.log(`[Spam Archiver] ✓ Archived ${archivedEmails.length} spam emails`);

        return {
            success: true,
            result: {
                totalChecked: emails.length,
                archivedCount: archivedEmails.length,
                keptCount: keptEmails.length,
                archivedEmails,
                keptEmails,
                reasoning: analysis.reasoning
            }
        };

    } catch (error) {
        console.error('[Spam Archiver] Error:', error.message);
        throw error;
    }
}

/**
 * Format result into readable summary
 */
function formatSummary(result) {
    let summary = `Checked ${result.totalChecked} emails and archived ${result.archivedCount} promotional messages.\n\n`;

    if (result.archivedCount > 0) {
        summary += '📧 Archived emails:\n';
        result.archivedEmails.forEach((email, index) => {
            summary += `${index + 1}. "${email.subject}" from ${email.from}\n`;
        });
        summary += '\n';
    }

    if (result.keptCount > 0) {
        summary += `✅ Kept ${result.keptCount} legitimate emails in inbox\n`;
    }

    return summary.trim();
}

module.exports = {
    analyzeAndArchiveSpam,
    formatSummary
};
