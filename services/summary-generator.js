/**
 * AI Summary Generator Service
 * Generates task summaries from execution logs using Anthropic API
 */

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Generate a task summary from execution logs
 * @param {Array} executionLogs - Array of log objects from execution_logs table
 * @param {Object} executionMetadata - Metadata about the execution (duration, cost, etc.)
 * @param {Object} module - Module configuration
 * @returns {Promise<{title: string, description: string}>}
 */
async function generateTaskSummary(executionLogs, executionMetadata, module) {
    try {
        // Condense logs to reduce token cost - keep only key stages
        const condensedLogs = condenseLogs(executionLogs);

        // Build context for AI
        const logsContext = condensedLogs
            .map(log => `[${log.stage || 'info'}] ${log.message}`)
            .join('\n');

        const prompt = `You are analyzing the execution logs of an autonomous agent module to create a task summary for a user's activity feed.

Module Name: ${module.name}
Module Purpose: ${module.description || 'N/A'}

Execution Logs:
${logsContext}

Generate a task summary with the following:

1. **Title** (1-8 words): Focus on the SPECIFIC OUTCOME or RESULT, not the generic module action. For example:
   - Good: "Fixed 3 security vulnerabilities in dependencies"
   - Bad: "Performed security audit"
   - Good: "Created GitHub PR with updated documentation"
   - Bad: "Updated project documentation"

2. **Description** (2-4 sentences): Provide a factual summary that explains:
   - What was actually done and why
   - Which files were modified or created (if any)
   - Key outcomes or findings

Do NOT include:
- Tool names or technical implementation details
- Execution metadata (cost, duration, turns)
- Generic descriptions of what the module is supposed to do

Return ONLY a JSON object with this exact structure:
{
  "title": "your title here",
  "description": "your description here"
}`;

        const response = await client.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 500,
            messages: [{
                role: 'user',
                content: prompt,
            }],
        });

        // Extract JSON from response
        const content = response.content[0].text;
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
            throw new Error('Failed to parse JSON from AI response');
        }

        const summary = JSON.parse(jsonMatch[0]);

        // Validate response
        if (!summary.title || !summary.description) {
            throw new Error('AI response missing required fields');
        }

        console.log('[Summary Generator] Generated summary:');
        console.log(`  Title: ${summary.title}`);
        console.log(`  Description: ${summary.description.substring(0, 100)}...`);

        return {
            title: summary.title.trim(),
            description: summary.description.trim(),
        };
    } catch (error) {
        console.error('[Summary Generator] Error generating summary:', error.message);

        // Fallback to basic summary
        return {
            title: module.name,
            description: module.description || `Executed module: ${module.name}`,
        };
    }
}

/**
 * Condense logs to reduce token cost while preserving key information
 * @param {Array} logs - Full execution logs
 * @returns {Array} Condensed logs
 */
function condenseLogs(logs) {
    // Keep logs that are likely to contain important information
    const importantStages = ['thinking', 'tool_use', 'completed', 'initialized'];

    // Filter to important logs
    let filtered = logs.filter(log => {
        // Always include thinking and tool_use stages
        if (importantStages.includes(log.stage)) {
            return true;
        }

        // Include logs with keywords indicating important actions
        const message = log.message?.toLowerCase() || '';
        const keywords = ['created', 'modified', 'updated', 'fixed', 'error', 'failed', 'completed', 'found', 'identified'];
        return keywords.some(keyword => message.includes(keyword));
    });

    // Limit to max 30 logs to avoid excessive tokens
    if (filtered.length > 30) {
        // Take first 10, middle 10, and last 10
        const start = filtered.slice(0, 10);
        const middle = filtered.slice(Math.floor(filtered.length / 2) - 5, Math.floor(filtered.length / 2) + 5);
        const end = filtered.slice(-10);
        filtered = [...start, ...middle, ...end];
    }

    return filtered;
}

module.exports = {
    generateTaskSummary,
};
