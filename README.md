# Polsia

The Autonomous System that Runs Your Company While You Sleep.

## Features

- **Express.js server** with static file serving
- **PostgreSQL database** for data storage
- **User authentication** with JWT tokens
- **Claude Agent SDK integration** for AI-powered code generation and editing
- **GitHub OAuth integration** for repository access and code automation
- **Service connections** management system
- **Modules system** for organizing AI tasks
- **Universal Paperclips-inspired minimalist UI**
- API endpoints for waitlist, authentication, and AI agent operations

## Setup

### Prerequisites

- Node.js >= 18.0.0
- PostgreSQL database (local or hosted)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/bencera/polsia.git
cd polsia
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and configure the following:
```bash
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/polsia

# JWT Authentication
JWT_SECRET=your-secret-key-change-in-production

# Anthropic Claude Agent SDK
ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# GitHub OAuth (create app at https://github.com/settings/developers)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback

# Token Encryption (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY=your-64-character-hex-encryption-key
```

### Local Development

Run the dev server with auto-reload:
```bash
npm run dev
```

The server will start on http://localhost:3000

### Production

Start the production server:
```bash
npm start
```

## Database Setup

### Local PostgreSQL

1. Create a database:
```bash
createdb polsia
```

2. The tables will be created automatically when the server starts

### Render PostgreSQL

1. Create a new PostgreSQL database on Render
2. Copy the "Internal Database URL"
3. Add it as `DATABASE_URL` environment variable in your Render Web Service

## API Endpoints

### Public Endpoints
- `GET /api/health` - Health check
- `POST /api/waitlist` - Add email to waitlist
- `GET /api/waitlist/count` - Get total waitlist count

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/logout` - User logout

### Protected Endpoints (require JWT token)
- `GET /api/tasks` - Get user tasks
- `GET /api/connections` - Get service connections
- `PUT /api/connections/:id` - Update connection status

### Claude Agent SDK
- `POST /api/agent/execute` - Execute coding task
- `POST /api/agent/generate` - Generate code files
- `POST /api/agent/edit` - Edit existing code
- `GET /api/agent/health` - Check SDK availability

### GitHub Integration (requires JWT + GitHub connection)
- `GET /api/auth/github` - Initiate GitHub OAuth flow
- `GET /api/auth/github/callback` - OAuth callback handler
- `DELETE /api/auth/github/:id` - Disconnect GitHub account
- `POST /api/agent/github/execute` - Execute AI task on GitHub repository
- `POST /api/agent/github/read` - Read code from GitHub repository

For detailed API documentation, see [`docs/GITHUB_INTEGRATION.md`](docs/GITHUB_INTEGRATION.md)

## Claude Agent SDK & GitHub Integration

### Overview

Polsia integrates with the Anthropic Claude Agent SDK to provide AI-powered code generation and editing capabilities. Combined with GitHub OAuth, users can:

- Read and analyze code from any GitHub repository they have access to
- Execute AI coding tasks directly on repositories
- Automatically commit and push AI-generated changes
- Create new branches for AI-generated code changes

### Setup Guide

1. **Get Anthropic API Key**
   - Sign up at https://console.anthropic.com/
   - Generate an API key
   - Add to `.env` as `ANTHROPIC_API_KEY`

2. **Create GitHub OAuth App**
   - Go to https://github.com/settings/developers
   - Create new OAuth App
   - Set callback URL: `http://localhost:3000/api/auth/github/callback`
   - Add credentials to `.env`

3. **Run Database Migrations**
   ```bash
   npm run migrate
   ```

4. **Connect GitHub Account**
   - Login to Polsia
   - Navigate to `/connections`
   - Click "Connect GitHub"
   - Authorize access

### Usage Example

```javascript
// Execute AI task on GitHub repository
const response = await fetch('/api/agent/github/execute', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    repoUrl: 'https://github.com/username/repo',
    prompt: 'Add JSDoc comments to all exported functions',
    autoPush: true,
    commitMessage: 'Add documentation',
    createBranch: true,
    newBranchName: 'polsia-ai-docs'
  })
});
```

### Testing

Test the GitHub integration:
```bash
node test-github-integration.js
```

Test the Claude Agent SDK:
```bash
node test-claude-sdk.js
```

## Deployment

### Deploy to Render

1. Push code to GitHub
2. Create new Web Service on Render
3. Connect your repository
4. Configure:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Add PostgreSQL database and link to Web Service
6. Deploy!

## License

MIT
