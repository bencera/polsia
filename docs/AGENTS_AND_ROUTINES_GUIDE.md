# Agents & Routines Configuration Guide

## 🤖 Understanding the Architecture

### The Hierarchy

```
User
└── Agents (Persistent workers with sessions)
    └── Routines (Scheduled tasks executed by the agent)
        └── Executions (Individual runs tracked in module_executions table)
```

### Key Concepts

**Agent** = A persistent AI worker with:
- Identity & capabilities (role, description)
- Persistent session (maintains context across tasks)
- Workspace directory (files persist between executions)
- Access to specific tools (MCP servers)

**Routine** = A scheduled task that:
- Belongs to exactly ONE agent
- Runs on a schedule (auto/daily/weekly/manual)
- Has a specific goal/prompt
- Inherits the agent's session and workspace

**Main Agent vs Sub-Agents**:
- **"Main agent"** = The Claude Agent SDK itself (the execution engine)
- **Your "agents"** = Database records that define WHO executes WHAT with WHICH tools
- Think of it like: SDK is the "brain", your agents are "personalities"

---

## 🎯 Agent Attributes

### Required Fields

```javascript
{
  // IDENTITY
  name: 'Engineer Agent',                    // Display name
  description: 'Software engineer responsible for...', // Short summary
  role: `Full multi-line prompt...`,         // THE MOST IMPORTANT FIELD

  // CLASSIFICATION
  agent_type: 'engineer',                    // Unique type identifier

  // STATE
  status: 'active',                          // 'active' | 'paused' | 'disabled'

  // CONFIGURATION
  config: {
    mcpMounts: ['github', 'reports'],        // Which MCP servers to load
    maxTurns: 50,                            // Max conversation turns
    mcpConfig: {                             // MCP-specific config
      github: { owner: 'username', repo: 'repo-name' }
    }
  }
}
```

### The `role` Field: The Agent's Instructions

This is **where the agent's personality, capabilities, and behavior are defined**. This is NOT in CLAUDE.md - it's in the database.

**Structure of a good role prompt:**

```markdown
You are the [Agent Name] - [one-line description].

## Your Role & Capabilities

[List what tools/MCPs you have access to]

## Your Responsibilities

1. **Area 1**: What you do
2. **Area 2**: What you handle
3. **Area 3**: Your scope

## How You Work

When assigned a task:
1. Step 1
2. Step 2
3. Step 3

## [Domain-Specific Guidelines]

[Best practices, metrics, decision rules for your domain]

## Communication

When completing tasks:
- What to report
- How to format updates
- What links/data to provide

## Tools You Have

- **Tool 1**: What it does
- **Tool 2**: What it does
```

### Example Agents by Type

**Engineer Agent:**
```javascript
{
  name: 'Engineer Agent',
  agent_type: 'engineer',
  description: 'Software developer for code tasks',
  role: `You are the Engineer Agent - a skilled software developer.

## Your Role & Capabilities
- GitHub MCP: Read/write repos, create PRs, search code

## Your Responsibilities
1. **Code Development**: Implement features and fixes
2. **Debugging**: Investigate issues
3. **Code Review**: Review quality

## How You Work
1. Understand requirement
2. Plan approach
3. Implement changes
4. Test
5. Create PR

## Code Quality Standards
- Clean, readable code
- Follow existing patterns
- Test changes
- Descriptive commits`,
  config: {
    mcpMounts: ['github'],
    maxTurns: 50
  }
}
```

**Analytics Agent:**
```javascript
{
  name: 'Analytics Agent',
  agent_type: 'analytics',
  description: 'Collects metrics and generates reports',
  role: `You are an Analytics Agent that collects metrics and generates reports.

## Your Responsibilities
1. **Data Collection**: Query databases and APIs for metrics
2. **Report Generation**: Create daily/weekly summaries
3. **Trend Analysis**: Identify patterns

## Metrics You Track
- User growth
- Revenue
- System performance
- Errors/incidents

## Tools You Have
- **Reports MCP**: Save reports to database
- **Render MCP** (optional): Query Render metrics`,
  config: {
    mcpMounts: ['reports', 'render'],
    maxTurns: 30
  }
}
```

---

## 📅 Routine Attributes

### Required Fields

```javascript
{
  // OWNERSHIP
  agent_id: 5,                               // Which agent executes this

  // IDENTITY
  name: 'Daily Analytics Report',            // Display name
  description: 'Collect metrics and generate daily report',
  type: 'analytics_daily',                   // Routine type identifier

  // SCHEDULING
  status: 'active',                          // 'active' | 'paused' | 'disabled'
  frequency: 'daily',                        // 'auto' | 'daily' | 'weekly' | 'manual'

  // EXECUTION DETAILS
  config: {
    goal: `Generate daily analytics snapshot...`,   // THE TASK PROMPT
    guardrails: {
      maxCost: 1.0,                         // Optional cost limit
      timeout: 300                          // Optional timeout (seconds)
    }
  },

  // TIMESTAMPS (auto-managed)
  last_run_at: '2025-01-05T12:00:00Z',
  next_run_at: '2025-01-06T12:00:00Z'
}
```

### The `config.goal` Field: The Task Prompt

This is the **specific instruction for this routine**. It gets passed to the agent when the routine runs.

**Example routine configs:**

```javascript
// Analytics Routine
{
  name: 'Daily Analytics Report',
  agent_id: 6,  // Analytics Agent
  type: 'analytics_daily',
  frequency: 'daily',
  config: {
    goal: `Generate a daily analytics snapshot for ${new Date().toLocaleDateString()}.

## Metrics to Collect
- Total users (all time)
- Active users (last 24h)
- Total executions (all time)
- Executions today
- Total cost (all time)
- Cost today

## Output
Create a report using the reports MCP with:
- report_type: "render_analytics"
- report_date: today's date
- Clear markdown summary

Compare today's metrics to yesterday if available.`
  }
}

// Security Routine
{
  name: 'Security Patcher',
  agent_id: 5,  // Security Agent
  type: 'security_scan',
  frequency: 'daily',
  config: {
    goal: `Scan repositories for security vulnerabilities.

## Steps
1. Query Sentry for unresolved errors
2. Prioritize by severity (critical > high > medium)
3. For critical/high issues:
   - Investigate root cause
   - Create fix in new branch
   - Submit PR with description
4. Mark resolved issues in Sentry

## Report
List what you fixed and any issues requiring manual review.`
  }
}
```

### Frequency Options

- **`auto`**: Runs every 6 hours (for real-time monitoring)
- **`daily`**: Runs once per day (at hourly scheduler check)
- **`weekly`**: Runs once per week
- **`manual`**: Only runs when user clicks "Run Now"

---

## 🔧 Setting Up an Agent + Routines

### Step 1: Create the Agent

```sql
INSERT INTO agents (
  user_id, name, description, role, agent_type, status, config
) VALUES (
  1,
  'Analytics Agent',
  'Collects metrics and generates business reports',
  '-- Full role prompt here (see examples above) --',
  'analytics',
  'active',
  '{
    "mcpMounts": ["reports", "render"],
    "maxTurns": 30
  }'::jsonb
);
```

### Step 2: Create Routines for That Agent

```sql
INSERT INTO routines (
  user_id, agent_id, name, description, type, status, frequency, config
) VALUES
(
  1,
  6,  -- Analytics Agent ID
  'Daily Analytics Report',
  'Generate daily snapshot of key metrics',
  'analytics_daily',
  'active',
  'daily',
  '{
    "goal": "Generate daily analytics snapshot... (full prompt)"
  }'::jsonb
),
(
  1,
  6,  -- Same agent
  'Weekly Performance Review',
  'Weekly deep-dive on trends and anomalies',
  'analytics_weekly',
  'active',
  'weekly',
  '{
    "goal": "Analyze last 7 days of metrics... (full prompt)"
  }'::jsonb
);
```

---

## 🧩 How CLAUDE.md Fits In

**CLAUDE.md is NOT used for agent/routine configuration.**

CLAUDE.md is for:
- Project documentation for **you** (the developer using Claude Code)
- Development commands, architecture notes, etc.

Your agents get their instructions from:
1. **Agent `role`** - The agent's overall persona/capabilities
2. **Routine `config.goal`** - The specific task to execute

When a routine runs:
```
┌─────────────────────────────────────────┐
│ Routine Executor                        │
│                                         │
│ 1. Load agent's role prompt             │
│ 2. Load routine's goal prompt           │
│ 3. Combine into execution prompt:       │
│                                         │
│    "You are [role].                     │
│     Your current routine: [goal]"       │
│                                         │
│ 4. Pass to Claude Agent SDK             │
│ 5. Execute with agent's MCP servers     │
└─────────────────────────────────────────┘
```

---

## 📝 Example: Full Setup

Let's create a **Meta Ads Agent** with 2 routines:

### 1. Create Agent

```javascript
const agent = {
  name: 'Meta Ads Agent',
  agent_type: 'meta_ads',
  description: 'Manages Meta advertising campaigns and optimizes ROAS',

  role: `You are the Meta Ads Agent - a performance marketing specialist.

## Your Capabilities
- **Meta Ads MCP**: Create/update campaigns, get insights, manage budgets
- **Reports MCP**: Save daily performance reports

## Your Responsibilities
1. Monitor campaign performance (ROAS, spend, conversions)
2. Optimize budgets (allocate to high performers)
3. Pause underperforming campaigns
4. Create test campaigns

## Decision Rules
- Pause campaign if ROAS <1.0 for 3+ days
- Increase budget if ROAS >3.0 consistently
- Create new campaigns with $10-20/day budgets

## Metrics You Track
- ROAS (target >2.0)
- Daily spend vs budget
- Conversions
- CPM, CPC, CTR

## Communication
Report specific metrics, campaign IDs, and actions taken.`,

  config: {
    mcpMounts: ['meta_ads', 'reports'],
    maxTurns: 40
  }
};
```

### 2. Create Daily Optimization Routine

```javascript
const dailyOptimization = {
  agent_id: agent.id,
  name: 'Daily Campaign Optimization',
  type: 'meta_ads_optimization',
  frequency: 'daily',
  status: 'active',

  config: {
    goal: `Optimize Meta ad campaigns for ${new Date().toLocaleDateString()}.

## Tasks
1. Get campaign performance (last 24h)
2. Calculate ROAS for each campaign
3. Take actions:
   - Pause campaigns with ROAS <1.0 for 3+ days
   - Increase budget (+20%) for ROAS >3.0
   - Create report with all actions taken

## Output
Use reports MCP to save:
- report_type: "meta_ads_daily"
- List of actions taken
- Current performance summary
- Recommendations for manual review`
  }
};
```

### 3. Create Weekly Strategy Routine

```javascript
const weeklyStrategy = {
  agent_id: agent.id,
  name: 'Weekly Ads Strategy Review',
  type: 'meta_ads_strategy',
  frequency: 'weekly',
  status: 'active',

  config: {
    goal: `Review Meta ads strategy for the past week.

## Analysis
1. Pull insights for last 7 days
2. Identify trends:
   - Which campaigns performed best?
   - Which audiences converted best?
   - Any creative fatigue (frequency >5)?
3. Generate strategic recommendations

## Output
Create report with:
- Top 3 performing campaigns
- Top 3 underperformers
- Audience insights
- Creative recommendations
- Budget allocation suggestions for next week`
  }
};
```

---

## 🎯 Best Practices

### Agent Design

**DO:**
- ✅ Give agents clear, focused roles (Engineer, Analytics, Ads, etc.)
- ✅ List specific tools/MCPs they have access to
- ✅ Define decision rules and thresholds
- ✅ Include communication guidelines

**DON'T:**
- ❌ Make agents too broad ("general purpose agent")
- ❌ Assume agents know about your business without context
- ❌ Forget to specify what data/links to return

### Routine Design

**DO:**
- ✅ Make goal prompts specific and actionable
- ✅ Break down steps explicitly
- ✅ Specify exact output format
- ✅ Include date context (today's date, week of, etc.)
- ✅ Reference what MCP tools to use

**DON'T:**
- ❌ Use vague prompts ("check performance")
- ❌ Assume agents remember previous runs
- ❌ Forget to specify report format/destination

### Testing

```bash
# Test an agent's first routine run
node scripts/test-agent-flow.js

# Manually trigger a routine
# POST /api/routines/{id}/run

# Check execution logs
# GET /api/modules/{moduleId}/executions/{executionId}/logs
```

---

## 🚀 Quick Start Checklist

- [ ] Define your agents (what roles do you need?)
- [ ] Write detailed `role` prompts for each agent
- [ ] Determine which MCP servers each agent needs
- [ ] Create agents in database (via seed script or API)
- [ ] Design routines for each agent
- [ ] Write specific `goal` prompts for each routine
- [ ] Set appropriate frequency for each routine
- [ ] Test manually before enabling auto-schedule
- [ ] Monitor first few runs to refine prompts
