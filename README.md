# Polsia

The Autonomous System that Runs Your Company While You Sleep.

## Features

- Express.js server with static file serving
- PostgreSQL database for waitlist storage
- API endpoints for waitlist management
- Universal Paperclips-inspired minimalist UI

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

Edit `.env` and add your database URL:
```
DATABASE_URL=postgresql://username:password@localhost:5432/polsia
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

- `GET /api/health` - Health check
- `POST /api/waitlist` - Add email to waitlist
- `GET /api/waitlist/count` - Get total waitlist count

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
