# How Agent Role & Task Prompts Flow to Claude SDK

## 📊 The Complete Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. TRIGGER (Scheduler or Manual)                                │
│    POST /api/routines/{routineId}/run                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. ROUTINE EXECUTOR (services/routine-executor.js)              │
│                                                                  │
│    runRoutine(routineId, userId)                                │
│    ├─ Load routine from database                                │
│    ├─ Load owning agent from database                           │
│    └─ Build combined prompt                                     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. BUILD PROMPT (buildRoutinePrompt function)                   │
│                                                                  │
│    Combines:                                                     │
│    ┌────────────────────────────────────────────────────────┐  │
│    │ agent.role                                             │  │
│    │   "You are the Analytics Agent..."                     │  │
│    │   "You have access to Reports MCP..."                  │  │
│    │   "Your responsibilities: 1. Collect metrics..."       │  │
│    └────────────────────────────────────────────────────────┘  │
│    +                                                             │
│    ┌────────────────────────────────────────────────────────┐  │
│    │ ## Current Routine                                      │  │
│    │ **Routine:** Daily Analytics Report                     │  │
│    │ **Type:** analytics_daily                               │  │
│    │ **Frequency:** daily                                    │  │
│    └────────────────────────────────────────────────────────┘  │
│    +                                                             │
│    ┌────────────────────────────────────────────────────────┐  │
│    │ ## Goal                                                 │  │
│    │ routine.config.goal                                     │  │
│    │   "Generate daily analytics snapshot..."               │  │
│    │   "Metrics to collect: users, executions, costs..."    │  │
│    └────────────────────────────────────────────────────────┘  │
│    +                                                             │
│    ┌────────────────────────────────────────────────────────┐  │
│    │ ## Context                                              │  │
│    │ **Today's Date:** Wednesday, January 6, 2025           │  │
│    │ **Current Time:** 2:30:00 PM                            │  │
│    └────────────────────────────────────────────────────────┘  │
│    +                                                             │
│    ┌────────────────────────────────────────────────────────┐  │
│    │ ## Instructions                                         │  │
│    │ Execute this routine as defined. You have access       │  │
│    │ to the tools mounted via MCP servers...                │  │
│    └────────────────────────────────────────────────────────┘  │
│                                                                  │
│    → Returns: Full combined prompt (500-2000 characters)        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. PREPARE EXECUTION CONTEXT                                    │
│                                                                  │
│    - Workspace: /temp/agent-sessions/agent-{id}/                │
│    - Session ID: agent.session_id (for memory persistence)      │
│    - MCP Servers: Load based on agent.config.mcpMounts          │
│    - Max Turns: agent.config.maxTurns or 100                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. CALL CLAUDE AGENT SDK (services/claude-agent.js)             │
│                                                                  │
│    executeTask(prompt, {                                        │
│      cwd: workspace,                                            │
│      resumeSessionId: agent.session_id,                         │
│      maxTurns: 100,                                             │
│      mcpServers: { github: {...}, reports: {...} }              │
│    })                                                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. CLAUDE AGENT SDK (@anthropic-ai/claude-agent-sdk)            │
│                                                                  │
│    query({                                                      │
│      prompt: "You are the Analytics Agent...\n\n              │
│               ## Current Routine\n                              │
│               Generate daily analytics...",                     │
│      options: {                                                 │
│        cwd: workspace,                                          │
│        resume: sessionId,                                       │
│        maxTurns: 100,                                           │
│        mcpServers: {...},                                       │
│        permissionMode: 'bypassPermissions'                      │
│      }                                                           │
│    })                                                            │
│                                                                  │
│    ↓ Spawns Claude Code subprocess                              │
│    ↓ Passes full prompt as system + user message                │
│    ↓ Loads session state if resuming                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. CLAUDE AI MODEL (claude-sonnet-4-5)                          │
│                                                                  │
│    Receives context:                                            │
│    - System prompt with agent role                              │
│    - User message with routine goal                             │
│    - Previous conversation history (if resuming)                │
│    - Available tools (from MCP servers)                         │
│    - Workspace files                                            │
│                                                                  │
│    Executes:                                                     │
│    ├─ Reads prompt and understands WHO it is (role)             │
│    ├─ Understands WHAT to do (goal)                             │
│    ├─ Uses tools (Read, Write, Bash, MCP tools)                 │
│    ├─ Generates reports, makes decisions                        │
│    └─ Returns summary                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📝 Code Examples

### 1. Database Schema (What Gets Stored)

```sql
-- AGENT (persistent worker)
CREATE TABLE agents (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),           -- "Analytics Agent"
  description TEXT,            -- Short summary
  role TEXT,                   -- ⭐ FULL MULTI-PARAGRAPH PROMPT
  agent_type VARCHAR(50),      -- "analytics"
  config JSONB                 -- { mcpMounts: [...], maxTurns: 50 }
);

-- ROUTINE (scheduled task)
CREATE TABLE routines (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER REFERENCES agents(id),  -- Which agent runs this
  name VARCHAR(255),           -- "Daily Analytics Report"
  type VARCHAR(50),            -- "analytics_daily"
  frequency VARCHAR(50),       -- "daily"
  config JSONB                 -- { goal: "Generate report..." }
);
```

### 2. Building the Prompt (routine-executor.js:289)

```javascript
async function buildRoutinePrompt(agent, routine, userId) {
    const config = routine.config || {};
    const goal = config.goal || routine.description;

    // Get current date/time
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // BUILD COMBINED PROMPT
    let prompt = '';

    // 1️⃣ Agent's Role (WHO they are, WHAT they can do)
    prompt += `${agent.role}\n\n`;

    // 2️⃣ Current Routine Metadata
    prompt += `## Current Routine\n\n`;
    prompt += `**Routine:** ${routine.name}\n`;
    prompt += `**Type:** ${routine.type}\n`;
    prompt += `**Frequency:** ${routine.frequency}\n\n`;

    // 3️⃣ Specific Goal (WHAT to do right now)
    prompt += `## Goal\n\n${goal}\n\n`;

    // 4️⃣ Date Context
    prompt += `## Context\n\n`;
    prompt += `**Today's Date:** ${dateStr}\n\n`;

    // 5️⃣ Instructions
    prompt += `## Instructions\n\n`;
    prompt += `Execute this routine as defined. You have access to the tools `;
    prompt += `mounted via MCP servers. Provide a summary of what you accomplished.\n`;

    return prompt;
}
```

### 3. Executing with Claude SDK (routine-executor.js:117)

```javascript
// After building prompt, execute it
const result = await executeTask(prompt, {
    cwd: workspace,                    // Agent's persistent workspace
    resumeSessionId: agent.session_id, // Resume previous conversations
    maxTurns: 100,                     // Max back-and-forth
    mcpServers: {                      // Tools available
        github: { command: 'npx', args: [...], env: {...} },
        reports: { command: 'node', args: [...], env: {...} }
    },
    onProgress: async (progress) => {
        // Stream logs in real-time
        console.log(progress.stage, progress.message);
    }
});
```

### 4. Claude SDK Execution (claude-agent.js:217)

```javascript
// Inside executeTask function
for await (const message of query({
    prompt,              // ⭐ The combined prompt from buildRoutinePrompt
    options: {
        cwd,
        resume: resumeSessionId,
        maxTurns,
        mcpServers,
        permissionMode: 'bypassPermissions'
    }
})) {
    // Process streaming messages
    // - system: init, session info
    // - assistant: thinking, tool use
    // - result: final output
}
```

---

## 🔍 Real Example

### Input (Database)

**Agent:**
```javascript
{
  name: 'Analytics Agent',
  role: `You are an Analytics Agent that collects metrics and generates reports.

## Your Capabilities
- Reports MCP: Save reports to database
- Render MCP: Query Render infrastructure

## Your Responsibilities
1. Collect daily metrics
2. Generate reports
3. Track trends`
}
```

**Routine:**
```javascript
{
  agent_id: 6,
  name: 'Daily Analytics Report',
  config: {
    goal: `Generate daily analytics snapshot for ${date}.

## Metrics to Collect
- Total users
- Executions today
- Cost today

## Output
Save report via reports MCP with today's date.`
  }
}
```

### Output (Prompt Sent to Claude)

```
You are an Analytics Agent that collects metrics and generates reports.

## Your Capabilities
- Reports MCP: Save reports to database
- Render MCP: Query Render infrastructure

## Your Responsibilities
1. Collect daily metrics
2. Generate reports
3. Track trends

## Current Routine

**Routine:** Daily Analytics Report
**Type:** analytics_daily
**Frequency:** daily

## Goal

Generate daily analytics snapshot for Wednesday, January 6, 2025.

## Metrics to Collect
- Total users
- Executions today
- Cost today

## Output
Save report via reports MCP with today's date.

## Context

**Today's Date:** Wednesday, January 6, 2025
**Current Time:** 2:30:00 PM

## Instructions

Execute this routine as defined. You have access to the tools mounted via MCP servers.
Provide a summary of what you accomplished.
```

---

## ✨ Key Takeaways

1. **Agent `role`** = System prompt (WHO you are, WHAT you can do)
2. **Routine `config.goal`** = User prompt (WHAT to do right now)
3. **Combined in code** by `buildRoutinePrompt()` function
4. **Passed as single string** to Claude SDK's `query({ prompt, options })`
5. **Claude receives it** as system + user message combination
6. **Session persists** - Claude remembers previous executions via `agent.session_id`

The agent's **`role`** is like their **job description** (permanent).
The routine's **`goal`** is like their **daily assignment** (changes per routine).

Together they form the complete instruction set for each execution!
