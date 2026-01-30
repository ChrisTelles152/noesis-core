# Noesis Server

Express.js backend server for the Noesis adaptive learning platform.

## Overview

The server provides:
- **REST API** for learning orchestration and analytics
- **WebSocket** real-time updates for attention and events
- **LLM Integration** with OpenAI and Anthropic for intelligent recommendations
- **Session-based Authentication** with Passport.js
- **PostgreSQL Storage** via Drizzle ORM (with in-memory fallback)

## Quick Start

```bash
# From repository root
npm install
npm run dev
```

The server starts on `http://localhost:5000` by default.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 5000) |
| `NODE_ENV` | No | Environment: development/production |
| `DATABASE_URL` | No | PostgreSQL connection string |
| `SESSION_SECRET` | **Yes (prod)** | Session encryption secret |
| `OPENAI_API_KEY` | No | OpenAI API key for LLM features |
| `ANTHROPIC_API_KEY` | No | Anthropic API key (fallback) |
| `CORS_ALLOWED_ORIGINS` | No | Comma-separated allowed origins |

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new user
- `POST /api/auth/login` - Authenticate user
- `POST /api/auth/logout` - End session
- `GET /api/auth/me` - Get current user
- `GET /api/auth/check-username/:username` - Check availability

### Orchestration (LLM-powered)
- `POST /api/orchestration/next-step` - Get next learning recommendation
- `POST /api/orchestration/engagement` - Submit engagement data

### Analytics
- `GET /api/analytics/attention` - Get attention history
- `GET /api/analytics/mastery` - Get mastery progress
- `GET /api/analytics/summary` - Get learning summary

### Events
- `POST /api/learning/events` - Record learning event
- `GET /api/learning/events` - Get user's events

### System
- `GET /health` - Health check
- `GET /health/ready` - Readiness check (internal)
- `GET /api/csrf-token` - Get CSRF token
- `GET /api/docs` - Swagger UI

## WebSocket API

Connect to `/ws` for real-time updates.

### Message Types

**Subscribe to channels:**
```json
{ "type": "subscribe", "payload": { "channels": ["attention", "learning-events"] } }
```

**Authenticate:**
```json
{ "type": "authenticate", "payload": { "sessionId": "..." } }
```

**Attention Update (server → client):**
```json
{ "type": "attention-update", "payload": { "score": 0.85, "focusStability": 0.9 } }
```

## Project Structure

```
apps/server/
├── index.ts          # Server entry point, middleware setup
├── routes.ts         # API route definitions
├── auth.ts           # Authentication (Passport.js)
├── csrf.ts           # CSRF protection
├── storage.ts        # Database operations
├── websocket.ts      # WebSocket service
├── logger.ts         # Logging utilities
├── health.ts         # Health check endpoints
├── env.ts            # Environment validation
├── errors.ts         # Error codes and handling
├── performance.ts    # Request timing middleware
├── openapi.ts        # Swagger/OpenAPI spec
├── middleware/       # Request middleware
│   ├── sanitize.ts   # Input sanitization
│   └── requestId.ts  # Request ID tracking
└── llm/              # LLM provider integrations
    └── providers/    # OpenAI, Anthropic, Fallback
```

## Security Features

- **Rate Limiting**: API (100/15min), Auth (10/15min), LLM (10/min)
- **CSRF Protection**: Double-submit cookie pattern
- **Input Sanitization**: Prototype pollution protection
- **Helmet**: Secure HTTP headers
- **Session Security**: httpOnly, secure, sameSite cookies
- **Password Hashing**: bcrypt with 12 rounds

## Development

```bash
# Run with hot reload
npm run dev

# Run tests
npm test -- apps/server

# Check types
npm run check
```

## Production

```bash
# Build
npm run build

# Start production server
npm start
```

Ensure `SESSION_SECRET` is set to a strong random value in production.
