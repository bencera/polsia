/**
 * Brain Orchestrator Service
 * The meta-agent that decides what the company should do next
 */

const { pool } = require('../db');
const db = require('../db');
const { getUnifiedContext, appendToMemory } = require('./document-store');
const { runDataAgent } = require('./data-agent');
const { runModule } = require('./agent-runner');
const { executeTask } = require('./claude-agent');

/**
 * Build the Brain system prompt with full context
 * @param {object} context - Unified context bundle
 * @returns {string} - System prompt for Brain
 */
function buildBrainPrompt(context) {
  const prompt = `You are Polsia's Brain Agent for ${context.user.name || context.user.email}.

Your role is to autonomously run this company by making strategic decisions about what tasks to execute next.

# Current Context

## Company Vision
${context.documents.vision_md}

## Company Goals
${context.documents.goals_md}

## Analytics & Performance
${context.documents.analytics_md}

### Structured Metrics
${JSON.stringify(context.documents.analytics_json, null, 2)}

## Recent Memory & Activity
${context.documents.memory_md}

## Available Modules
You have access to the following autonomous modules. Each can be executed to perform specific tasks:

${context.enabled_modules.map(m => `
### ${m.name} (ID: ${m.id})
- Type: ${m.type}
- Frequency: ${m.frequency}
- Status: ${m.status}
- Config: ${JSON.stringify(m.config, null, 2)}
`).join('\n')}

## Recent Executions (Last 20)
${context.recent_executions.slice(0, 10).map(e => `
- [${e.started_at}] ${e.module_name} (${e.module_type}): ${e.status}${e.error_message ? ` - Error: ${e.error_message}` : ''}
  Duration: ${e.duration_ms}ms, Cost: $${e.cost_usd || 0}
`).join('\n')}

## Connected Services
${context.connected_services.join(', ') || 'None'}

---

# Task Management

You have access to a task management system via MCP tools. Before making module execution decisions:

1. **Review Suggested Tasks**: Use \`get_available_tasks\` with status="suggested" to see tasks proposed by agents/modules
2. **Approve or Reject**: For each suggested task:
   - Use \`approve_task\` if it aligns with company goals (include approval_reasoning and assign_to_module_id)
   - Use \`reject_task\` if it doesn't fit priorities (include rejection_reasoning)

**Task Lifecycle**:
- "suggested" → (Brain reviews) → "approved" → (Agent picks up) → "in_progress" → "completed"
- Agents can propose tasks via \`create_task_proposal\` with suggestion_reasoning
- Once approved, agents will pick up and execute the task autonomously

**Your Responsibilities**:
- Review ALL suggested tasks before proceeding with module execution decisions
- Prioritize task approvals based on company goals and current state
- Provide clear reasoning for approvals/rejections to guide future agent behavior

---

# Your Task

Based on this complete context:
1. FIRST: Review and approve/reject any suggested tasks
2. THEN: Decide the SINGLE BEST action to take right now (either execute a module OR wait for approved tasks to be completed)

Consider:
- What goals are most urgent?
- What tasks haven't been done recently?
- Are there any anomalies or issues that need attention?
- What would provide the most value to the company right now?
- What integrations are available (connected services)?

## Decision Format

Return your decision as a JSON object with this exact structure:

\`\`\`json
{
  "action": "Brief description of what to do (e.g., 'Refresh security patches for repositories')",
  "reasoning": "Detailed explanation of why this is the best next step, considering goals, recent activity, and current state",
  "module_id": 123,
  "module_params": {
    "goal": "Specific instruction for the module to execute",
    "inputs": {
      "repo": "owner/repo-name",
      "branch": "main"
    }
  },
  "expected_outcome": "What success looks like for this task",
  "priority_level": "low|medium|high|critical"
}
\`\`\`

IMPORTANT:
- Choose a module_id from the Available Modules list above
- Make sure the module_params match the module's config requirements
- Be specific and actionable in the goal
- Consider the company's current goals and recent activity
- Explain your reasoning clearly

Return ONLY the JSON object, no other text.
`;

  return prompt;
}

/**
 * Parse Brain's decision from response
 * @param {string} response - Response from Brain
 * @returns {object|null} - Parsed decision or null if invalid
 */
function parseBrainDecision(response) {
  try {
    // Look for JSON in code blocks or raw JSON
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/```\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : response;

    const decision = JSON.parse(jsonText.trim());

    // Validate required fields
    if (!decision.action || !decision.reasoning || !decision.module_id) {
      throw new Error('Missing required fields: action, reasoning, or module_id');
    }

    return decision;
  } catch (error) {
    console.error('❌ [Brain] Failed to parse decision:', error.message);
    console.error('   Response:', response.substring(0, 500));
    return null;
  }
}

/**
 * Save Brain decision to database
 * @param {number} userId - User ID
 * @param {object} decision - Brain decision object
 * @param {number|null} executionId - Module execution ID (if module was executed)
 * @returns {Promise<object>} - Created decision record
 */
async function saveBrainDecision(userId, decision, executionId = null) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO brain_decisions (user_id, execution_id, decision_reasoning, action_description, module_id, priority, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        userId,
        executionId,
        decision.reasoning,
        decision.action,
        decision.module_id,
        decision.priority_level || 'medium',
        JSON.stringify({
          module_params: decision.module_params,
          expected_outcome: decision.expected_outcome,
        }),
      ]
    );

    console.log(`✅ [Brain] Decision saved to database (ID: ${result.rows[0].id})`);
    return result.rows[0];
  } catch (error) {
    console.error('❌ [Brain] Error saving decision:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get the last Brain decision for a user
 * @param {number} userId - User ID
 * @returns {Promise<object|null>} - Last decision or null
 */
async function getLastBrainDecision(userId) {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT bd.*, m.name as module_name, me.status as execution_status
       FROM brain_decisions bd
       LEFT JOIN modules m ON bd.module_id = m.id
       LEFT JOIN module_executions me ON bd.execution_id = me.id
       WHERE bd.user_id = $1
       ORDER BY bd.created_at DESC
       LIMIT 1`,
      [userId]
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error('❌ [Brain] Error getting last decision:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Extract text response from Claude Agent SDK messages
 * @param {Array} messages - Messages from executeTask
 * @returns {string|null} - Extracted text or null
 */
function extractResponseText(messages) {
  if (!messages || messages.length === 0) return null;

  // Look for assistant messages with text content
  const assistantMessages = messages.filter(m => m.type === 'assistant');

  for (const message of assistantMessages.reverse()) {
    if (message.message?.content) {
      for (const content of message.message.content) {
        if (content.type === 'text' && content.text) {
          return content.text;
        }
      }
    }
  }

  // Fallback: check for result message
  const resultMessage = messages.find(m => m.type === 'result');
  if (resultMessage?.result) {
    return resultMessage.result;
  }

  return null;
}

/**
 * Run a complete Brain cycle
 * @param {number} userId - User ID
 * @returns {Promise<object>} - Cycle result
 */
async function runBrainCycle(userId) {
  console.log(`\n🧠 [Brain] ========== Starting Brain Cycle for User ${userId} ==========`);
  const startTime = Date.now();

  try {
    // Step 1: Run Data Agent to refresh analytics
    console.log(`🧠 [Brain] Step 1: Running Data Agent to refresh analytics...`);
    await runDataAgent(userId);
    console.log(`✅ [Brain] Data Agent completed`);

    // Step 2: Get unified context (includes fresh analytics)
    console.log(`🧠 [Brain] Step 2: Fetching unified context...`);
    const context = await getUnifiedContext(userId);
    console.log(`✅ [Brain] Context fetched (${context.enabled_modules.length} modules, ${context.recent_executions.length} recent executions)`);

    // Step 3: Build Brain prompt
    console.log(`🧠 [Brain] Step 3: Building Brain prompt...`);
    const prompt = buildBrainPrompt(context);
    console.log(`✅ [Brain] Prompt built (${prompt.length} characters)`);

    // Step 4: Get Brain decision from Claude
    console.log(`🧠 [Brain] Step 4: Asking Claude for decision...`);

    // Configure MCP servers for Brain
    const taskMcpPath = require('path').join(__dirname, 'task-management-mcp-server.js');
    const reportsMcpPath = require('path').join(__dirname, 'reports-custom-mcp-server.js');

    const result = await executeTask(prompt, {
      cwd: process.cwd(),
      maxTurns: 5, // Increased to allow task review + decision
      mcpServers: {
        // Task Management MCP - allows Brain to review, approve, reject tasks
        tasks: {
          command: 'node',
          args: [taskMcpPath, `--user-id=${userId}`],
        },
        // Reports MCP - allows Brain to query historical reports for context
        reports: {
          command: 'node',
          args: [reportsMcpPath, `--user-id=${userId}`],
        }
      },
      skipFileCollection: true, // Brain only returns JSON, no files to collect
    });

    if (!result.success) {
      throw new Error(`Brain reasoning failed: ${result.error}`);
    }

    console.log(`✅ [Brain] Claude responded`);
    console.log(`   Received ${result.messages.length} messages`);

    // Extract text response from messages
    const responseText = extractResponseText(result.messages);
    if (!responseText) {
      throw new Error('No text response found in Claude messages');
    }

    console.log(`   Response preview: ${responseText.substring(0, 200)}...`);

    // Step 5: Parse decision
    console.log(`🧠 [Brain] Step 5: Parsing decision...`);
    const decision = parseBrainDecision(responseText);

    if (!decision) {
      throw new Error('Failed to parse Brain decision from response');
    }

    console.log(`✅ [Brain] Decision parsed:`);
    console.log(`   Action: ${decision.action}`);
    console.log(`   Module ID: ${decision.module_id}`);
    console.log(`   Priority: ${decision.priority_level}`);
    console.log(`   Reasoning: ${decision.reasoning.substring(0, 150)}...`);

    // Step 6: Validate module exists
    const module = await db.getModuleById(decision.module_id, userId);
    if (!module) {
      throw new Error(`Invalid module_id ${decision.module_id} - module not found for user`);
    }

    console.log(`✅ [Brain] Module validated: ${module.name}`);

    // Step 7: Save decision to database
    let decisionRecord = await saveBrainDecision(userId, decision, null);

    // Step 8: Execute the module
    console.log(`🧠 [Brain] Step 6: Executing module "${module.name}"...`);
    const executionResult = await runModule(decision.module_id, userId, {
      trigger_type: 'brain',
    });

    console.log(`✅ [Brain] Module execution ${executionResult.success ? 'succeeded' : 'failed'}`);

    // Update decision record with execution ID
    if (executionResult.execution_id) {
      const client = await pool.connect();
      try {
        await client.query(
          'UPDATE brain_decisions SET execution_id = $1 WHERE id = $2',
          [executionResult.execution_id, decisionRecord.id]
        );
        decisionRecord.execution_id = executionResult.execution_id;
      } finally {
        client.release();
      }
    }

    // Step 9: Update memory with result
    console.log(`🧠 [Brain] Step 7: Updating memory...`);
    const memoryEntry = `### Brain Decision: ${decision.action}

**Reasoning:** ${decision.reasoning}

**Action Taken:** Executed module "${module.name}" (${module.type})

**Result:** ${executionResult.success ? 'Success' : 'Failed'}${executionResult.error ? ` - ${executionResult.error}` : ''}

**Cost:** $${executionResult.cost_usd || 0} | **Duration:** ${executionResult.duration_ms || 0}ms
`;

    await appendToMemory(userId, memoryEntry);
    console.log(`✅ [Brain] Memory updated`);

    const duration = Date.now() - startTime;

    console.log(`\n🧠 [Brain] ========== Brain Cycle Complete (${(duration / 1000).toFixed(2)}s) ==========\n`);

    return {
      success: true,
      decision: decision,
      decision_record: decisionRecord,
      execution_result: executionResult,
      duration_ms: duration,
      cost_usd: (result.metadata?.cost_usd || 0) + (executionResult.cost_usd || 0),
    };

  } catch (error) {
    console.error(`\n❌ [Brain] Brain Cycle Failed:`, error.message);
    console.error(error.stack);

    // Log failure to memory
    try {
      await appendToMemory(userId, `### Brain Cycle Failed\n\n**Error:** ${error.message}`);
    } catch (memError) {
      console.error(`❌ [Brain] Failed to log error to memory:`, memError);
    }

    return {
      success: false,
      error: error.message,
      duration_ms: Date.now() - startTime,
    };
  }
}

module.exports = {
  runBrainCycle,
  getLastBrainDecision,
  saveBrainDecision,
  buildBrainPrompt,
  parseBrainDecision,
};
