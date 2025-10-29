# GitHub Integration with Claude Agent SDK

This document describes how Polsia integrates GitHub with the Claude Agent SDK to enable AI-powered code reading and writing directly on GitHub repositories.

## Overview

Polsia's GitHub integration allows users to:

1. **Connect GitHub Account** - OAuth 2.0 authentication to securely access repositories
2. **Read Repositories** - Clone and analyze code from any accessible repository
3. **Execute AI Tasks** - Run Claude Agent SDK tasks on repository code
4. **Auto-Push Changes** - Optionally commit and push AI-generated changes back to GitHub

## Architecture

### Components

```
┌─────────────────┐
│   Frontend UI   │ (Connections page)
│  /connections   │
└────────┬────────┘
         │ OAuth Flow
         ▼
┌─────────────────┐
│ GitHub OAuth    │ (routes/github-oauth.js)
│    Routes       │
└────────┬────────┘
         │ Store Token
         ▼
┌─────────────────┐
│   Database      │ (service_connections table)
│ Encrypted Token │
└────────┬────────┘
         │ Use Token
         ▼
┌─────────────────┐      ┌──────────────────┐
│ GitHub API      │◄─────┤ Claude Agent SDK │
│   Service       │      │   + GitHub       │
└─────────────────┘      └──────────────────┘
         │
         ▼
┌─────────────────┐
│ GitHub.com API  │
│  Repositories   │
└─────────────────┘
```

### Security Features

- **Token Encryption**: GitHub OAuth tokens are encrypted using AES-256-GCM before storage
- **CSRF Protection**: State parameter validation prevents cross-site request forgery
- **User Isolation**: Tokens are tied to user accounts with strict access controls
- **Scope Limitation**: Requests only necessary OAuth scopes (`repo`)

## Setup

### 1. Create GitHub OAuth App

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: Polsia
   - **Homepage URL**: `http://localhost:3000` (or your production URL)
   - **Authorization callback URL**: `http://localhost:3000/api/auth/github/callback`
4. Click "Register application"
5. Copy the **Client ID**
6. Generate a **Client Secret** and copy it

### 2. Configure Environment Variables

Add to your `.env` file:

```bash
# GitHub OAuth Configuration
GITHUB_CLIENT_ID=your-github-client-id-here
GITHUB_CLIENT_SECRET=your-github-client-secret-here
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback

# Token Encryption (already generated)
ENCRYPTION_KEY=your-64-character-hex-key
```

### 3. Run Database Migration

The `service_connections` table already exists. Verify with:

```bash
psql $DATABASE_URL -c "SELECT * FROM service_connections LIMIT 1;"
```

## User Flow

### Connecting GitHub Account

1. User logs into Polsia
2. User navigates to `/connections`
3. User clicks "Connect GitHub"
4. User is redirected to GitHub OAuth authorization page
5. User approves access
6. GitHub redirects back to Polsia with authorization code
7. Polsia exchanges code for access token
8. Token is encrypted and stored in database
9. User sees success message and GitHub account info

### Using GitHub with Claude Agent

```javascript
// API Request to execute task on GitHub repository
POST /api/agent/github/execute
Authorization: Bearer <user-jwt-token>
Content-Type: application/json

{
  "repoUrl": "https://github.com/username/repo",
  "prompt": "Add JSDoc comments to all exported functions",
  "autoPush": true,
  "commitMessage": "Add documentation comments",
  "createBranch": true,
  "newBranchName": "polsia-ai-docs",
  "maxTurns": 10
}
```

## API Endpoints

### GitHub OAuth Endpoints

#### `GET /api/auth/github`
**Authentication**: Required (JWT)
**Description**: Initiates GitHub OAuth flow

**Query Parameters**:
- `token` (string, required): User's JWT token

**Response**: Redirects to GitHub authorization page

---

#### `GET /api/auth/github/callback`
**Authentication**: None (callback from GitHub)
**Description**: Handles OAuth callback and stores token

**Query Parameters**:
- `code` (string): Authorization code from GitHub
- `state` (string): CSRF protection token

**Response**: Redirects to `/connections?success=github_connected` or `/connections?error=...`

---

#### `DELETE /api/auth/github/:id`
**Authentication**: Required (JWT)
**Description**: Disconnects GitHub account

**URL Parameters**:
- `id` (integer): Connection ID

**Response**:
```json
{
  "success": true,
  "message": "GitHub connection deleted"
}
```

### Agent + GitHub Endpoints

#### `POST /api/agent/github/execute`
**Authentication**: Required (JWT)
**Description**: Execute Claude Agent SDK task on GitHub repository

**Request Body**:
```typescript
{
  repoUrl: string;          // GitHub repository URL (required)
  prompt: string;           // Task description (required)
  autoPush?: boolean;       // Auto-commit and push changes (default: false)
  commitMessage?: string;   // Custom commit message (default: "Changes by Polsia AI Agent")
  branch?: string;          // Branch to work on (default: default branch)
  createBranch?: boolean;   // Create new branch (default: false)
  newBranchName?: string;   // Name for new branch (required if createBranch=true)
  maxTurns?: number;        // Max conversation turns (default: 10)
}
```

**Response**:
```json
{
  "success": true,
  "files": {
    "src/index.js": "...",
    "README.md": "..."
  },
  "messages": [...],
  "metadata": {
    "total_duration_ms": 45000,
    "cost_usd": 0.023456,
    "num_turns": 5,
    "repository": "https://github.com/user/repo",
    "branch": "polsia-ai-docs",
    "pushed": true,
    "commit_message": "Add documentation comments"
  }
}
```

---

#### `POST /api/agent/github/read`
**Authentication**: Required (JWT)
**Description**: Read code from GitHub repository

**Request Body**:
```typescript
{
  repoUrl: string;     // GitHub repository URL (required)
  filePath?: string;   // Specific file to read (optional, reads all if omitted)
  branch?: string;     // Branch to read from (default: default branch)
}
```

**Response (full repository)**:
```json
{
  "success": true,
  "type": "repository",
  "files": {
    "package.json": "...",
    "src/index.js": "...",
    "README.md": "..."
  },
  "repository": {
    "full_name": "username/repo",
    "description": "Repository description",
    "default_branch": "main"
  }
}
```

**Response (specific file)**:
```json
{
  "success": true,
  "type": "file",
  "path": "package.json",
  "content": "{ \"name\": \"...\", ... }",
  "repository": { ... }
}
```

## Usage Examples

### Example 1: Read Repository

```javascript
const axios = require('axios');

async function readRepo() {
  const response = await axios.post(
    'http://localhost:3000/api/agent/github/read',
    {
      repoUrl: 'https://github.com/username/my-project',
      branch: 'main'
    },
    {
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  console.log('Files found:', Object.keys(response.data.files).length);
  console.log('Repository:', response.data.repository.full_name);
}
```

### Example 2: Add Documentation

```javascript
async function addDocs() {
  const response = await axios.post(
    'http://localhost:3000/api/agent/github/execute',
    {
      repoUrl: 'https://github.com/username/my-project',
      prompt: 'Add comprehensive JSDoc comments to all functions in the src/ directory',
      autoPush: false, // Review changes before pushing
      maxTurns: 10
    },
    {
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  console.log('Task completed:', response.data.success);
  console.log('Cost:', `$${response.data.metadata.cost_usd}`);
  console.log('Files modified:', Object.keys(response.data.files));
}
```

### Example 3: Refactor with New Branch

```javascript
async function refactorCode() {
  const response = await axios.post(
    'http://localhost:3000/api/agent/github/execute',
    {
      repoUrl: 'https://github.com/username/my-project',
      prompt: 'Refactor the authentication module to use async/await instead of callbacks',
      autoPush: true,
      commitMessage: 'Refactor: Convert auth module to async/await',
      createBranch: true,
      newBranchName: 'refactor/auth-async-await',
      maxTurns: 15
    },
    {
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (response.data.success && response.data.metadata.pushed) {
    console.log('✅ Changes pushed to branch:', response.data.metadata.branch);
    console.log('Create a PR on GitHub to merge the changes');
  }
}
```

## Frontend Integration

The Connections page (`client/src/pages/Connections.jsx`) provides the UI for:

- Displaying GitHub connection status
- Initiating OAuth flow
- Showing connected account info (avatar, username, repo count)
- Disconnecting GitHub account

### Key Features:

1. **Connect Button**: Redirects to OAuth flow
2. **Account Display**: Shows avatar, username, and public repos
3. **Disconnect Button**: Removes connection with confirmation
4. **Success/Error Messages**: OAuth callback handling

## Service Layer

### GitHub API Service (`services/github-api.js`)

Provides wrapper functions for GitHub REST API:

- `getUserInfo(token)` - Get authenticated user info
- `listRepositories(token, options)` - List user repositories
- `getRepository(token, owner, repo)` - Get repository details
- `getContents(token, owner, repo, path, ref)` - Get file contents
- `cloneRepository(token, repoUrl, targetDir, branch)` - Clone repository using git
- `createOrUpdateFile(token, owner, repo, path, content, message, sha, branch)` - Create/update file
- `pushChanges(token, repoDir, commitMessage, branch)` - Commit and push changes
- `createBranch(token, owner, repo, branchName, fromBranch)` - Create new branch

### Claude Agent Service (`services/claude-agent.js`)

Extended with GitHub integration functions:

- `executeTaskWithGitHub(userId, repoUrl, prompt, options)` - Execute AI task on repository
- `readGitHubRepository(userId, repoUrl, filePath, options)` - Read repository code

**Workflow**:
1. Retrieve and decrypt user's GitHub token
2. Clone repository to temporary directory
3. Optionally create new branch
4. Execute Claude Agent SDK task in repository
5. Optionally commit and push changes
6. Cleanup temporary directory

## Database Schema

### `service_connections` Table

```sql
CREATE TABLE service_connections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_name VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'connected',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, service_name)
);
```

### GitHub Connection Metadata

```json
{
  "username": "octocat",
  "avatar_url": "https://avatars.githubusercontent.com/u/...",
  "profile_url": "https://github.com/octocat",
  "public_repos": 42,
  "encrypted_token": "a1b2c3...",
  "token_iv": "def456...",
  "token_auth_tag": "789ghi..."
}
```

## Security Considerations

### Token Storage

- Tokens are encrypted using AES-256-GCM before storage
- Each token has a unique initialization vector (IV)
- Authentication tags ensure data integrity
- Encryption key stored in environment variable (not in code)

### OAuth Security

- State parameter prevents CSRF attacks
- State tokens expire after 10 minutes
- Authorization codes are single-use
- Callback URL is validated

### API Security

- All GitHub routes require JWT authentication
- Tokens are user-scoped (users can only access their own tokens)
- Database queries use parameterized statements (SQL injection prevention)
- Error messages don't leak sensitive information

## Troubleshooting

### "No GitHub account connected" Error

**Cause**: User hasn't connected their GitHub account
**Solution**: Go to `/connections` and click "Connect GitHub"

### "Invalid GitHub repository URL" Error

**Cause**: Repository URL format is incorrect
**Solution**: Use format `https://github.com/owner/repo`

### "Failed to clone repository" Error

**Possible Causes**:
1. Repository is private and user doesn't have access
2. Repository doesn't exist
3. Git is not installed on server
4. Network connectivity issues

**Solutions**:
- Verify repository exists and user has access
- Check server has `git` installed: `git --version`
- Check server network connectivity to GitHub

### "Failed to push changes" Error

**Possible Causes**:
1. Branch is protected
2. User doesn't have push access
3. Merge conflict

**Solutions**:
- Check branch protection rules on GitHub
- Verify user has write access to repository
- Review the changes manually and push separately

## Limitations

1. **Repository Size**: Large repositories may take longer to clone and process
2. **Rate Limits**: GitHub API has rate limits (5000 requests/hour for authenticated users)
3. **Token Expiration**: GitHub tokens don't expire, but can be revoked by user
4. **Private Repositories**: Requires `repo` scope (full access)
5. **Temporary Storage**: Cloned repositories are stored temporarily and cleaned up

## Future Enhancements

- [ ] WebSocket/SSE for real-time progress updates
- [ ] Repository caching to reduce clone times
- [ ] Incremental git operations (fetch/pull instead of full clone)
- [ ] Support for GitHub Apps (more granular permissions)
- [ ] Pull request creation API
- [ ] Code review suggestions
- [ ] Multi-repository batch operations
- [ ] GitHub Codespaces integration

## Related Documentation

- [Claude Agent SDK Documentation](https://docs.anthropic.com/claude/docs/claude-agent-sdk)
- [GitHub OAuth Documentation](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [GitHub REST API Documentation](https://docs.github.com/en/rest)

## Support

For issues or questions about the GitHub integration:

1. Check this documentation
2. Review error logs in server console
3. Verify environment variables are set correctly
4. Check GitHub OAuth app configuration
5. Test with a simple public repository first

---

**Last Updated**: 2025-01-XX
**Version**: 1.0.0
