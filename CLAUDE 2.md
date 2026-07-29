# CLAUDE.md — noesis-core

## Project Overview

Cross-platform adaptive learning SDK monorepo - the core engine for Noesis's "Stripe for adaptive learning" infrastructure. Combines BKT (Bayesian Knowledge Tracing) + FSRS (Free Spaced Repetition Scheduling) algorithms with deterministic, event-sourced architecture.

## Quick Reference

```bash
npm install               # Install dependencies (monorepo)
npm run dev              # Start backend server (port 5174)
npm run dev:web          # Start frontend demo
npm run build            # Build all packages and apps
npm test                 # Run 800+ tests across 35 test files
npm run build:core       # Build @noesis-edu/core package only
```

## Architecture

**Monorepo structure** (npm workspaces):
- `packages/core/` — @noesis-edu/core (ZERO dependencies, deterministic engine)
- `packages/sdk-web/` — Web SDK facade  
- `packages/adapters-llm/` — LLM provider integration
- `packages/adapters-attention-web/` — WebGazer.js attention tracking
- `apps/server/` — Express backend with API endpoints
- `apps/web-demo/` — React + Vite frontend demo

## Key Constraints

### Core Engine Rules (packages/core/)
- **ZERO dependencies** policy - no external packages allowed
- **Deterministic replay** - all state transitions must be pure and replayable
- **Event-sourced architecture** - every state change creates an event
- **Injectable clock/RNG** - time and randomness must be controllable for testing
- **Subject-agnostic** - no domain-specific logic in core engine

### Development Standards
- **TypeScript strict mode** with explicit types
- **2-space indentation** with Prettier + ESLint
- **Atomic commits** with `type(scope): description` format
- **800+ tests** must continue passing (currently 35 test files)
- **Performance targets:** <100ms API responses, <2s load times

## Critical Patterns

### Learning Engine Integration
```typescript
import { NoesisCoreEngine } from '@noesis-edu/core';

// Always inject clock and RNG for determinism
const engine = new NoesisCoreEngine({
  clock: () => Date.now(),  
  rng: Math.random,
  // ... other config
});

// Event-sourced state management
const events = engine.processLearnerAction(action);
const newState = engine.replayEvents(events);
```

### API Endpoint Structure
```typescript
// apps/server/routes.ts pattern
app.post('/api/learning/submit', async (req, res) => {
  try {
    // 1. Validate input with Zod
    const data = submitSchema.parse(req.body);
    
    // 2. Process via core engine  
    const result = await engine.submitAnswer(data);
    
    // 3. Log for analytics
    logger.info('answer_submitted', { userId: req.user.id, ...data });
    
    // 4. Return structured response
    res.json({ success: true, data: result });
  } catch (error) {
    // Always handle errors explicitly
    logger.error('submit_error', { error: error.message });
    res.status(400).json({ error: 'Invalid submission' });
  }
});
```

## Testing Requirements

### Core Engine Testing
- **Deterministic replay** tests for every state transition
- **Pure function** validation (no side effects)
- **Event sourcing** integrity checks
- **Cross-platform compatibility** (Node.js, browsers)

### Integration Testing  
- **API endpoint** validation with Supertest
- **Database integration** with proper isolation
- **LLM adapter** functionality with mock providers
- **Attention tracking** with simulated input

### Performance Testing
- **Bundle size** monitoring (<1MB for web builds)
- **Memory usage** validation (no leaks in long sessions)
- **API latency** measurement (<100ms target)
- **Concurrent user** load testing

## Environment Configuration

### Required Variables
```bash
# Optional: Server configuration
PORT=5174                    # Default port (avoids macOS AirPlay conflict)
HOST=127.0.0.1              # Default host

# Required: LLM features
OPENAI_API_KEY=sk-...        # OpenAI integration

# Optional: Database 
DATABASE_URL=postgresql://   # Falls back to in-memory if not set
SQLITE_PATH=./noesis.sqlite  # Alternative to PostgreSQL

# Optional: Security
SESSION_SECRET=...           # Auto-generated in development
ALLOWED_ORIGINS=https://...  # CORS configuration for production
```

### Development Setup
1. **Clone and install:** Standard npm monorepo setup
2. **Environment:** Copy `.env.example` to `.env`  
3. **Dependencies:** `npm install` (handles workspace linking)
4. **Development:** `npm run dev` starts backend, `npm run dev:web` for frontend
5. **Testing:** `npm test` runs full suite

## Deployment Protocols

### Package Publishing (@noesis-edu/core)
```bash
npm run build:core          # Build package
npm run test:core           # Validate tests pass
npm run smoke:core          # Smoke test package
npm run release:core        # Publish to npm (production)
npm run release:core:rc     # Publish release candidate
```

### Production Deployment
- **Backend:** Node.js with Express server
- **Frontend:** Static build via Vite (serves from `dist/`)
- **Database:** PostgreSQL recommended, SQLite for development
- **Environment:** All secrets via environment variables

## Common Workflows

### Adding New Learning Algorithm
1. **Core package:** Implement in `packages/core/src/`
2. **Maintain determinism:** Pure functions, injectable dependencies
3. **Event integration:** Create events for all state changes
4. **Testing:** Deterministic replay tests required
5. **Documentation:** Update API docs and examples

### Adding New Assessment Type  
1. **Schema definition:** Update core interfaces
2. **Processing logic:** Implement in engine modules
3. **API integration:** Add endpoints in apps/server/
4. **Frontend support:** Update web-demo if needed
5. **Content validation:** Ensure JSONL schema compatibility

### Performance Optimization
1. **Profiling:** Use built-in performance measurement
2. **Bundle analysis:** Check package sizes and dependencies  
3. **Memory testing:** Extended session monitoring
4. **Database optimization:** Query performance analysis
5. **Caching strategy:** Implement appropriate caching layers

## Troubleshooting

### Common Issues
- **Build failures:** Clear node_modules, check TypeScript errors
- **Test failures:** Verify deterministic replay integrity
- **Performance issues:** Profile bundle sizes and API calls
- **Integration issues:** Check workspace dependency linking

### Debug Commands
```bash
npm run check               # TypeScript validation
npm run lint                # Code quality check  
npm run test:coverage       # Test coverage report
npm run build:core          # Isolated core package build
node --loader ts-node/esm   # Direct TypeScript execution
```

## Mission Alignment

Every change must serve the core mission: **deterministic, subject-agnostic learning infrastructure** that developers can embed to get adaptive learning without building it themselves.

**Determinism over cleverness. Mastery over engagement. Infrastructure over applications.**

## Success Metrics

- **800+ tests passing** with deterministic replay verification
- **<100ms API response** times for learning endpoints  
- **<1MB bundle size** for core package
- **Zero dependency** policy maintained for core engine
- **Cross-platform compatibility** across Node.js and browsers

This SDK is the foundation that makes Noesis the "Stripe for adaptive learning" — reliable, embeddable, and focused on real mastery outcomes.