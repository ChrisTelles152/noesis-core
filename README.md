# Noesis Core

**Cross-platform adaptive learning SDK for attention-aware, personalized education.**
Built for XR, desktop, mobile, and web platforms.

---

## Purpose

Noesis Core is the foundation for adaptive, neuro-aware educational experiences.
It provides modular SDKs to track attention, orchestrate learning content, and integrate with modern UI/UX frameworks.

> "Learning infrastructure should adapt to the learner — not the other way around."

---

## Key Features

| Feature | Status | Description |
|---------|--------|-------------|
| **Attention Tracking** | ✅ Ready | Gaze tracking with WebGazer.js (optional) or simulation mode |
| **Mastery Learning** | ✅ Ready | Spaced repetition algorithm for optimal learning retention |
| **LLM Orchestration** | ✅ Ready | OpenAI GPT-4o integration for personalized recommendations |
| **Authentication** | ✅ Ready | User registration, login, Google OAuth, and session management |
| **Database Persistence** | ✅ Ready | SQLite (recommended), PostgreSQL, or in-memory storage |
| **Voice Interface** | 🔄 Planned | Voice commands and audio feedback |
| **XR Support** | 🔄 Planned | Quest, Vision Pro, and desktop simulation |

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/ChrisTelles152/noesis-core.git
cd noesis-core

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
# Edit .env with your settings (OPENAI_API_KEY required for LLM features)

# Start development server
npm run dev
```

Open http://localhost:5174 in your browser.

> **Note**: Default port is 5174 (avoids macOS AirPlay Receiver conflict on port 5000).
> Default host is 127.0.0.1 (localhost only). Override with environment variables:
> ```bash
> PORT=3000 HOST=0.0.0.0 npm run dev  # Custom port, allow external access
> ```

---

## Project Structure

This is a monorepo using npm workspaces with the following structure:

```
noesis-core/
├── packages/                      # NPM packages (publishable)
│   ├── core/                      # @noesis-edu/core - Learning engine (ZERO dependencies)
│   │   └── src/
│   │       ├── constitution.ts    # Core interfaces and contracts
│   │       ├── engine/            # NoesisCoreEngine orchestration
│   │       ├── learner/           # BKT learner model
│   │       ├── memory/            # FSRS spaced repetition
│   │       ├── planning/          # Session planning
│   │       ├── graph/             # Skill graph (DAG)
│   │       ├── transfer/          # Transfer testing gates
│   │       ├── diagnostic/        # Cold-start assessment
│   │       ├── events/            # Canonical event schema
│   │       └── persistence/       # Storage adapters
│   ├── sdk-web/                   # @noesis/sdk-web - Web SDK facade
│   │   └── src/
│   │       ├── NoesisSDK.ts       # Unified SDK interface
│   │       ├── core/              # Core engine adapter
│   │       └── policies/          # Learning policies
│   ├── adapters-llm/              # @noesis/adapters-llm - LLM providers
│   │   └── src/
│   │       ├── manager.ts         # LLM provider manager
│   │       ├── orchestration.ts   # Client orchestration
│   │       └── providers/         # OpenAI, Anthropic, fallback
│   └── adapters-attention-web/    # @noesis/adapters-attention-web
│       └── src/
│           ├── webgazer-adapter.ts # WebGazer.js integration
│           └── attention.ts       # Attention tracking
├── apps/                          # Applications
│   ├── server/                    # Express backend
│   │   ├── index.ts               # Server entry point
│   │   ├── routes.ts              # API endpoints
│   │   ├── auth.ts                # Authentication (Passport.js)
│   │   ├── storage.ts             # Data storage
│   │   ├── llm/                   # LLM provider implementations
│   │   └── middleware/            # Request handling
│   └── web-demo/                  # React + Vite frontend
│       └── src/
│           ├── hooks/             # React hooks
│           ├── pages/             # Page components
│           ├── components/        # UI components
│           └── sdk/               # SDK wrappers
├── shared/                        # Shared types and schemas
│   └── schema.ts                  # Drizzle ORM schema
└── .env.example                   # Environment configuration
```

---

## Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Optional: Server port (default: 5174, avoids macOS AirPlay conflict on 5000)
PORT=5174

# Optional: Server host (default: 127.0.0.1, use 0.0.0.0 for external/container access)
HOST=127.0.0.1

# Required for LLM features
OPENAI_API_KEY=sk-your-api-key-here

# Optional: SQLite database (recommended for self-hosted/pilot)
SQLITE_PATH=./data/noesis.sqlite

# Optional: PostgreSQL database (alternative to SQLite; uses in-memory if neither set)
DATABASE_URL=postgresql://user:password@localhost:5432/noesis

# Optional: Session secret (auto-generated in development)
SESSION_SECRET=your-session-secret

# Optional: Allowed origins for CORS in production
ALLOWED_ORIGINS=https://example.com
```

---

## SDK Usage

### Basic Setup

```typescript
import { NoesisSDK } from './sdk/NoesisSDK';

const sdk = new NoesisSDK({
  debug: true,
  attentionOptions: {
    useRealGazeTracking: true, // Enable WebGazer.js
    showGazePoints: false,      // Debug visualization
  }
});

// Start tracking
await sdk.attention.startTracking(document.getElementById('content'));

// Get learner state
const state = sdk.getLearnerState();
console.log('Attention:', state.attention?.score);
console.log('Mastery:', state.mastery);
```

### Mastery Tracking

```typescript
// Add learning objectives
sdk.mastery.addObjective('algebra-101', 'Introduction to Algebra');
sdk.mastery.addObjective('algebra-102', 'Linear Equations');

// Record learning results
sdk.mastery.recordResult({ objectiveId: 'algebra-101', result: 0.85 });

// Get next items to review
const dueItems = sdk.mastery.getReviewDueItems();
```

### Attention Tracking with WebGazer

```typescript
// Enable real gaze tracking (requires webcam permission)
await sdk.attention.startTracking(targetElement, {
  useRealGazeTracking: true,
  showGazePoints: true, // Show debug dots on screen
});

// Listen for attention changes
sdk.attention.onAttentionChange((data) => {
  console.log('Score:', data.score);
  console.log('Focus Stability:', data.focusStability);
  console.log('Gaze Point:', data.gazePoint);
});
```

---

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/auth/check-username/:username` | Check username availability |

### Orchestration (LLM)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orchestration/next-step` | Get AI-powered learning recommendation |
| POST | `/api/orchestration/engagement` | Get re-engagement suggestion |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/attention` | Get attention events |
| GET | `/api/analytics/mastery` | Get mastery progress |
| POST | `/api/learning/events` | Record learning event |

---

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

Current test coverage: **800+ tests** across 35 test files.

### Core Engine Smoke Test

To test the `@noesis-edu/core` package in-browser:

```bash
# Terminal 1: Start backend (optional, for full demo)
npm run dev

# Terminal 2: Start frontend
npm run dev:web
```

Open http://localhost:5173/core-smoke in your browser. This page tests:
- Event generation (practice, session start/end)
- `getNextAction` sequence
- JSON export
- Deterministic replay verification

---

## Security Features

- **Password Hashing**: bcrypt with 12 salt rounds
- **Session Management**: Secure HTTP-only cookies
- **Rate Limiting**: API (100 req/15min), LLM endpoints (10 req/min)
- **CORS**: Configurable origin validation
- **Input Validation**: Zod schemas on all endpoints

---

## Tech Stack

- **Frontend**: React, Vite, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, Passport.js
- **Database**: SQLite (better-sqlite3), PostgreSQL (Drizzle ORM), or in-memory
- **Testing**: Vitest, Testing Library, Supertest
- **AI/ML**: OpenAI GPT-4o, WebGazer.js

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and add tests
4. Run `npm test` and `npm run check`
5. Submit a pull request

---

## License

MIT License - see [LICENSE](LICENSE) for details.
