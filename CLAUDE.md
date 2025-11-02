# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Polsia is an autonomous AI automation platform powered by the Claude Agent SDK. It allows users to create and run "modules" (autonomous AI tasks) that execute on schedules while they're away, with the tagline: "The Autonomous System that Runs Your Company While You Sleep."

**Key Technologies:**
- Backend: Express.js + PostgreSQL
- Frontend: React (Vite)
- AI: Anthropic Claude Agent SDK + Model Context Protocol (MCP)
- OAuth Integrations: GitHub, Gmail, Instagram (Late.dev), Meta Ads

## Development Commands

### Quick Start
```bash
# Install all dependencies (server + client)
npm install && npm run client:install

# Run full dev environment (server + client with hot reload)
npm run dev

# Run server only (nodemon with auto-restart)
npm run server

# Run client only (Vite dev server)
npm run client
```

### Database Operations
```bash
# Run all pending migrations
npm run migrate

# Rollback last migration
npm run migrate:down

# Create new migration file
npm run migrate:create <migration-name>

# Seed default modules into database
npm run seed:modules
```

### Build & Deployment
```bash
# Full production build (install deps + build client + seed modules)
npm run build

# Build client only
npm run client:build

# Start production server
npm start
```

### Testing
```bash
# Test Claude Agent SDK
node test-claude-sdk.js

# Test GitHub integration
node test-github-integration.js

# Create test user account
node create-test-user.js
```

## Architecture

### Request Flow

1. **Client** (React SPA) → `/api/*` endpoints
2. **Express Routes** (`routes/*.js`) → Authenticate with JWT middleware
3. **Services** (`services/*.js`) → Business logic
4. **Database** (`db.js`) → PostgreSQL queries
5. **External APIs** → GitHub, Gmail, Late.dev, Fal.ai, etc.

### Module Execution Flow

```
User triggers module → scheduler.js (cron) OR manual trigger
    ↓
agent-runner.js (orchestrates execution)
    ↓
Prepare context (fetch OAuth tokens, MCP configs)
    ↓
claude-agent.js (executeTask with MCP servers)
    ↓
Claude Agent SDK executes with tools (GitHub MCP, Gmail MCP, etc.)
    ↓
Save execution logs, track cost, store results
    ↓
Return execution summary
```

### Key Services

**`services/agent-runner.js`** - Orchestrates module execution
- Creates execution records in database
- Prepares execution context (OAuth tokens, MCP servers)
- Calls Claude Agent SDK via `claude-agent.js`
- Tracks logs, costs, and execution metadata
- Handles special module types (email summarizer, security patcher)

**`services/claude-agent.js`** - Claude Agent SDK wrapper
- Lazy-loads `@anthropic-ai/claude-agent-sdk`
- Executes tasks with MCP server configurations
- Streams messages and tracks costs
- Provides GitHub-specific helpers (executeTaskWithGitHub, readGitHubRepository)

**`services/scheduler.js`** - Cron job scheduler
- Runs modules on schedule (daily, weekly, auto)
- Uses `node-cron` to trigger `agent-runner.js`

**`services/late-api-service.js`** - Social media posting
- Late.dev API integration
- Post to Twitter, Instagram, TikTok, LinkedIn
- Handles Instagram OAuth flow

**`services/fal-ai-service.js`** - AI content generation
- Image/video generation via Fal.ai
- Supports flux-pro, flux-dev, flux-schnell models

**`services/r2-media-service.js`** - Cloudflare R2 media storage
- S3-compatible API for media uploads
- Optional (fallback to local storage if not configured)

**`services/gmail-provider.js`** - Gmail integration
- Uses `@gongrzhe/server-gmail-autoauth-mcp` MCP server
- Reads emails, archives spam, sends messages

### Database Layer

All database queries are centralized in `db.js`. Key patterns:

**Connection**: Uses `pg` Pool with connection string from `DATABASE_URL` env var

**Migrations**: Managed via `node-pg-migrate` in `/migrations/*.js`

**Token Encryption**: OAuth tokens stored encrypted in `service_connections.metadata` using AES-256-GCM (see `utils/encryption.js`)

**Key Tables**:
- `users` - User accounts (JWT auth)
- `modules` - AI task definitions with config (type, frequency, MCP mounts)
- `module_executions` - Execution history (status, duration, cost)
- `execution_logs` - Streaming logs from module runs
- `service_connections` - OAuth tokens (encrypted) for GitHub, Gmail, etc.
- `profiles` - Social media profiles (maps to Late.dev)
- `social_accounts` - Connected social accounts per profile
- `content` - Scheduled/posted social media content
- `media` - Media attachments (R2 URLs or local paths)
- `ai_generations` - AI-generated content metadata

### MCP (Model Context Protocol) Integration

Polsia uses MCP servers to extend Claude Agent SDK with external tool access:

**GitHub MCP** (`@modelcontextprotocol/server-github`):
- Read/write repositories
- Create branches, commits, PRs
- Search code

**Gmail MCP** (`@gongrzhe/server-gmail-autoauth-mcp`):
- Read emails (with filters)
- Send emails
- Archive/label messages

**MCP Server Configuration** (in module config):
```json
{
  "mcpMounts": ["github", "gmail"],
  "mcpConfig": {
    "github": {
      "owner": "username",
      "repo": "repo-name"
    }
  }
}
```

**MCP Bridge**: `services/mcp-http-bridge.js` hosts MCP servers over HTTP for external clients

### OAuth Flow Pattern

All OAuth integrations follow this pattern (see `routes/*-oauth.js`):

1. **Initiate**: `GET /api/auth/{service}?token={jwt}` → Redirect to OAuth provider
2. **Callback**: `GET /api/auth/{service}/callback?code={code}&state={state}` → Exchange code for token
3. **Store**: Encrypt token and save to `service_connections` table
4. **Use**: Decrypt token when needed in services

**CSRF Protection**: State parameter with expiring in-memory cache

**Token Storage**: Encrypted using `ENCRYPTION_KEY` env var (AES-256-GCM)

### Frontend Architecture

**Client Stack**: React 19 + Vite + React Router

**Pages**:
- `Landing.jsx` - Marketing landing page
- `Login.jsx` - JWT authentication
- `Dashboard.jsx` - Stats overview (modules, executions, costs)
- `Modules.jsx` - Module management with real-time execution terminal (SSE streaming)
- `Connections.jsx` - OAuth service connections

**Auth Pattern**:
```javascript
// Store JWT in localStorage
localStorage.setItem('token', token);

// Add to all API requests
headers: { 'Authorization': `Bearer ${token}` }
```

**Real-time Logs**: Uses Server-Sent Events (SSE) at `/api/modules/:id/executions/:executionId/logs/stream?token={jwt}`

## Important Patterns & Conventions

### Authentication Middleware

**Header-based** (most routes):
```javascript
app.use('/api/protected', authenticateToken);
```

**Query-based** (OAuth callbacks, SSE):
```javascript
app.use('/api/auth/github/callback', authenticateTokenFromQuery);
// Accepts ?token={jwt} because browsers don't send headers in redirects
```

### Module Types

Modules have a `type` field that determines execution behavior:

- `security_patcher` - Scans GitHub repos for vulnerabilities, creates PRs
- `email_summarizer` - Fetches recent emails and generates summaries
- `social_content_generator` - Creates and posts AI-generated content
- Custom types can be added via `scripts/seed-default-modules.js`

### Execution Logging Pattern

When running modules, always log to `execution_logs` table:

```javascript
await saveExecutionLog(executionId, {
  timestamp: new Date(),
  level: 'info', // 'info', 'error', 'debug'
  message: 'Task completed',
  metadata: { cost: 0.05 }
});
```

Logs are streamed to frontend via SSE in real-time.

### Cost Tracking

Claude API usage is tracked in `module_executions.metadata`:

```javascript
{
  cost_usd: 0.025,
  input_tokens: 1500,
  output_tokens: 800,
  num_turns: 5
}
```

Calculate using Anthropic pricing (see `claude-agent.js` for token counting).

## Environment Variables

Critical environment variables (see `.env.example` for full list):

**Required**:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for signing JWT tokens
- `ANTHROPIC_API_KEY` - Claude API key
- `ENCRYPTION_KEY` - 64-char hex key for token encryption

**OAuth Integrations**:
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_CALLBACK_URL`
- `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET` (via Late.dev)
- `META_APP_ID`, `META_APP_SECRET`, `META_CALLBACK_URL`

**Optional Services**:
- `LATE_API_KEY` - Late.dev API for social media
- `FAL_KEY` - Fal.ai API for AI generation
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` - Cloudflare R2
- `SLACK_WEBHOOK_URL` - Slack notifications

## Common Development Workflows

### Adding a New Module Type

1. Define module type in database (via migration or seed script)
2. Add execution logic in `services/agent-runner.js` (check `module.type`)
3. Create specialized service if needed (like `email-summarizer.js`)
4. Update frontend to display module-specific UI

### Adding a New OAuth Integration

1. Create OAuth app with provider
2. Add credentials to `.env`
3. Create route file `routes/{service}-oauth.js` (follow pattern from `github-oauth.js`)
4. Register route in `server.js`
5. Add UI in `client/src/pages/Connections.jsx`
6. Create service wrapper in `services/{service}-api.js`

### Adding a New MCP Server

1. Install MCP server package: `npm install @modelcontextprotocol/server-{name}`
2. Configure in `services/claude-agent.js` (add to `mcpServers` config)
3. Update module config schema to support new MCP mount
4. Test with `executeTask()` function

### Debugging Module Execution

1. Check execution status: `SELECT * FROM module_executions ORDER BY created_at DESC LIMIT 10;`
2. View logs: `SELECT * FROM execution_logs WHERE execution_id = {id} ORDER BY timestamp;`
3. Check server console for `[Agent Runner]` and `[Claude Agent]` logs
4. Use frontend terminal in Modules page for real-time streaming

## File Structure

```
polsia/
├── server.js                 # Express app entry point
├── db.js                     # Database queries (all SQL here)
├── routes/                   # Express route handlers
│   ├── agent-routes.js       # General Claude Agent endpoints
│   ├── module-routes.js      # Module CRUD + execution triggers
│   ├── *-oauth.js            # OAuth flows (GitHub, Gmail, etc.)
│   └── social-routes.js      # Social media posting
├── services/                 # Business logic layer
│   ├── agent-runner.js       # Module execution orchestrator
│   ├── claude-agent.js       # Claude SDK wrapper
│   ├── scheduler.js          # Cron job scheduler
│   ├── *-api.js              # External API wrappers
│   └── *-service.js          # Domain-specific services
├── migrations/               # Database schema migrations (node-pg-migrate)
├── scripts/                  # Utility scripts (seed data, DB fixes)
├── utils/                    # Shared utilities (encryption, etc.)
├── client/                   # React frontend
│   ├── src/
│   │   ├── pages/            # Page components
│   │   ├── components/       # Reusable components
│   │   └── App.jsx           # Router setup
│   └── public/
└── docs/                     # Documentation
```

## Database Migrations

**Creating a new migration**:
```bash
npm run migrate:create add-new-feature
```

This creates `migrations/{timestamp}_add-new-feature.js` with up/down functions:

```javascript
exports.up = (pgm) => {
  pgm.createTable('new_table', {
    id: 'id',
    name: { type: 'varchar(255)', notNull: true },
    created_at: { type: 'timestamp', default: pgm.func('current_timestamp') }
  });
};

exports.down = (pgm) => {
  pgm.dropTable('new_table');
};
```

**Running migrations**:
```bash
npm run migrate      # Apply pending migrations
npm run migrate:down # Rollback last migration
```

**Important**: Always write `down()` migrations for rollback support.

## Security Considerations

**Token Encryption**: All OAuth tokens stored with AES-256-GCM encryption
**SQL Injection**: All queries use parameterized statements (`$1, $2, ...`)
**CSRF Protection**: OAuth flows use state parameter validation
**JWT Expiration**: Tokens expire after 7 days
**Scope Limitation**: OAuth requests minimum necessary scopes

## Deployment (Render.com)

Polsia is optimized for Render deployment:

**Build Command**: `npm run build` (installs deps, builds client, seeds modules)
**Start Command**: `npm start`

**Services Needed**:
1. Web Service (this repo)
2. PostgreSQL database (link via `DATABASE_URL`)

**Environment Variables**: Set all required env vars in Render dashboard

## Additional Resources

- Claude Agent SDK: https://docs.anthropic.com/claude/docs/claude-agent-sdk
- Model Context Protocol: https://modelcontextprotocol.io/
- GitHub Integration Docs: `docs/GITHUB_INTEGRATION.md`
- Late.dev API: https://late.dev/docs
- Fal.ai API: https://fal.ai/docs
