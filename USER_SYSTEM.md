# Polsia User System

This document explains how to use the new user authentication and management system in Polsia.

## Overview

The user system includes:
- JWT-based authentication
- Login page at `/login`
- Dashboard with task history at `/dashboard`
- Settings page for managing service connections at `/settings`
- Protected API routes for user data

## Architecture

### Backend
- **Database**: PostgreSQL with 4 new tables:
  - `users` - User accounts
  - `tasks` - Task history
  - `service_connections` - GitHub, Notion, Slack connections
  - `task_services` - Many-to-many relationship between tasks and services

- **Authentication**: JWT tokens with 7-day expiration
- **API Routes**:
  - `POST /api/auth/login` - Login
  - `GET /api/auth/me` - Get current user
  - `POST /api/auth/logout` - Logout
  - `GET /api/tasks` - Get user's tasks
  - `GET /api/connections` - Get user's service connections
  - `PUT /api/connections/:id` - Update connection status

### Frontend
- **Framework**: React 18 with Vite
- **Routing**: React Router
- **State Management**: React Context for auth
- **Pages**:
  - `/login` - Login form
  - `/dashboard` - Task history with service badges
  - `/settings` - Service connection management

## Getting Started

### 1. Environment Setup

Add to your `.env` file:
```bash
JWT_SECRET=your-secret-key-change-in-production
```

### 2. Database Setup

The database tables will be created automatically when you start the server. Just make sure your `DATABASE_URL` is set in `.env`.

### 3. Create Test User

Run the seed script to create a test user with sample data:

```bash
# Using psql
psql $DATABASE_URL -f seed.sql

# Or connect to your database and run the seed.sql file
```

This creates:
- Test user: `test@polsia.ai` / `password123`
- 3 service connections (GitHub, Notion, Slack)
- 6 sample tasks with service relationships

### 4. Build the React App

```bash
# Install client dependencies and build
npm run build
```

This will:
1. Install dependencies in the `/client` folder
2. Build the React app
3. Output to `/public/app` directory

### 5. Start the Server

```bash
# Production
npm start

# Development (server only)
npm run dev

# Development (client only - runs on port 5173)
npm run client
```

## Development Workflow

### Running in Development Mode

For development, run both the server and client:

**Terminal 1 - Backend:**
```bash
npm run dev
# Server runs on http://localhost:3000
```

**Terminal 2 - Frontend:**
```bash
npm run client
# React dev server runs on http://localhost:5173
# API calls are proxied to http://localhost:3000
```

Visit http://localhost:5173 to see the React app with hot reloading.

### Building for Production

```bash
# Build the client
npm run build

# Start the server
npm start
```

The server will serve:
- Landing page at `/` (from `/public/index.html`)
- React app at `/login`, `/dashboard`, `/settings` (from `/public/app/index.html`)
- API routes at `/api/*`

## Creating Additional Users

### Option 1: Using the Helper Script

Generate a password hash:
```bash
node generate-password.js yourpassword
```

Then insert into the database:
```sql
INSERT INTO users (email, password_hash, name)
VALUES ('user@example.com', '<generated-hash>', 'User Name');
```

### Option 2: Direct SQL

```sql
-- Replace the password_hash with output from generate-password.js
INSERT INTO users (email, password_hash, name)
VALUES ('newuser@polsia.ai', '$2b$10$...', 'New User');

-- Add service connections
INSERT INTO service_connections (user_id, service_name, status)
VALUES
    ((SELECT id FROM users WHERE email = 'newuser@polsia.ai'), 'github', 'connected'),
    ((SELECT id FROM users WHERE email = 'newuser@polsia.ai'), 'notion', 'connected'),
    ((SELECT id FROM users WHERE email = 'newuser@polsia.ai'), 'slack', 'connected');
```

## API Usage

### Authentication

Login:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@polsia.ai","password":"password123"}'
```

Use the returned token in subsequent requests:
```bash
curl http://localhost:3000/api/tasks \
  -H "Authorization: Bearer <your-token>"
```

### Protected Routes

All protected routes require the `Authorization: Bearer <token>` header.

Get tasks:
```bash
GET /api/tasks
```

Get connections:
```bash
GET /api/connections
```

Update connection:
```bash
PUT /api/connections/:id
Body: { "status": "connected" | "disconnected" }
```

## Routing

- `/` - Landing page (waitlist)
- `/login` - Login page (React app)
- `/dashboard` - Task history (React app, protected)
- `/settings` - Service connections (React app, protected)
- `/api/*` - API routes

## Security Notes

1. **JWT Secret**: Change the default JWT secret in production
2. **HTTPS**: Always use HTTPS in production
3. **CORS**: CORS is enabled - configure as needed for production
4. **Password Policy**: Consider adding password strength requirements
5. **Rate Limiting**: Consider adding rate limiting to auth endpoints

## Next Steps

1. Implement OAuth flows for GitHub, Notion, Slack
2. Add password reset functionality
3. Add user profile management
4. Add task creation/editing functionality
5. Add real-time updates with WebSockets
6. Add email notifications

## Troubleshooting

### "Access token required" error
- Make sure you're including the Authorization header
- Check that your token hasn't expired (7-day expiration)

### "User not found" error
- Run the seed script to create test users
- Or manually create users using the generate-password.js script

### React app not loading
- Make sure you've run `npm run build`
- Check that files exist in `/public/app`
- Verify server.js is serving from the correct path

### Database connection errors
- Verify DATABASE_URL is set in .env
- Make sure PostgreSQL is running
- Check database credentials

## Support

For issues or questions, please refer to the main README.md or create an issue.
