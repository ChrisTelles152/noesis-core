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
| **Authentication** | ✅ Ready | User registration, login, and session management |
| **Database Persistence** | ✅ Ready | PostgreSQL via Drizzle ORM (optional, falls back to in-memory) |
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

```
noesis-core/
├── client/               # Frontend (React + Vite)
│   ├── src/
│   │   ├── sdk/          # Core SDK modules
│   │   │   ├── attention.ts      # Attention tracking
│   │   │   ├── mastery.ts        # Spaced repetition
│   │   │   ├── orchestration.ts  # LLM integration
│   │   │   └── webgazer-adapter.ts # Real gaze tracking
│   │   ├── hooks/        # React hooks (useAuth, useAttentionTracking, etc.)
│   │   ├── pages/        # Page components (Home, Demo, Login, Register)
│   │   └── components/   # UI components
├── server/               # Backend (Express)
│   ├── auth.ts           # Authentication (Passport.js)
│   ├── routes.ts         # API endpoints
│   ├── storage.ts        # Data storage (PostgreSQL or in-memory)
│   └── db.ts             # Database connection
├── shared/               # Shared types and schemas
└── .env.example          # Environment configuration template
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

# Optional: PostgreSQL database (uses in-memory if not set)
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

Current test coverage: **115 tests** across 6 test files.

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
- **Database**: PostgreSQL (Drizzle ORM) or in-memory
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
