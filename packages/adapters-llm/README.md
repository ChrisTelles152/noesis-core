# @noesis/adapters-llm

LLM integration adapters for the Noesis learning system.

## Overview

This package provides LLM (Large Language Model) integration for Noesis:

- **Client-side Orchestrator** - API client for browser apps
- **Server-side LLM Manager** - Multi-provider support with fallback
- **Providers** - OpenAI, Anthropic, and rule-based fallback

## Important Note

**LLM integration is OPTIONAL.** The core Noesis learning loop (skill graph, mastery modeling, spaced retrieval) does not require LLM-based recommendations. LLMs provide supplementary personalization and engagement features.

## Installation

```bash
npm install @noesis/adapters-llm
```

## Client Usage (Browser)

```typescript
import { Orchestrator } from '@noesis/adapters-llm';

const orchestrator = new Orchestrator(apiKey, debug);

// Get next learning step recommendation
const response = await orchestrator.getNextStep({
  learnerState: {
    attention: { score: 0.7, ... },
    mastery: [...],
    timestamp: Date.now(),
  },
  context: 'algebra lesson',
});

console.log(response.suggestion);
console.log(response.explanation);
```

## Server Usage (Node.js)

```typescript
import { getLLMManager } from '@noesis/adapters-llm';

const llm = getLLMManager();

// Get recommendation using available provider
const result = await llm.getRecommendation({
  attentionScore: 0.6,
  masteryData: [...],
  learningContext: 'physics',
});

console.log('Provider used:', result.provider);
console.log('Recommendation:', result.content);
```

## Providers

| Provider | API Key Env Var | Status |
|----------|-----------------|--------|
| OpenAI | `OPENAI_API_KEY` | ✅ Supported |
| Anthropic | `ANTHROPIC_API_KEY` | ✅ Supported |
| Fallback | (none) | ✅ Always available |

The LLM Manager automatically selects providers based on available API keys and falls back gracefully if calls fail.

## Error Handling

The LLM system is designed to fail gracefully:

```typescript
// All methods return structured responses, never throw
const result = await llm.getRecommendation({...});

if (result.provider === 'fallback') {
  // LLM providers unavailable or failed - using rule-based fallback
  console.log('Using fallback recommendations');
}

// Check which provider was used
console.log('Provider:', result.provider); // 'openai', 'anthropic', or 'fallback'
console.log('Model:', result.model);       // e.g., 'gpt-4o', 'claude-3-5-sonnet'
```

### Common Error Scenarios

| Scenario | Behavior |
|----------|----------|
| No API keys configured | Uses fallback provider |
| API rate limit exceeded | Falls back to next provider |
| Network timeout | Falls back to next provider |
| Invalid API response | Falls back with error recovery message |
| All providers fail | Returns rule-based fallback response |

### Fallback Provider

The fallback provider returns sensible defaults based on attention and mastery data:

- Low attention → Suggests taking a break or switching topics
- High mastery → Suggests advancing to new material
- Low mastery → Suggests review and practice
- Mixed signals → Provides balanced recommendation

## Configuration

### Environment Variables

```bash
# OpenAI (optional)
OPENAI_API_KEY=sk-...

# Anthropic (optional)
ANTHROPIC_API_KEY=sk-ant-...

# At least one key is recommended for personalized recommendations
# Without any keys, only the fallback provider is used
```

### Provider Priority

1. **Anthropic** (if `ANTHROPIC_API_KEY` is set)
2. **OpenAI** (if `OPENAI_API_KEY` is set)
3. **Fallback** (always available)

Providers are tried in order. If the first fails, the next is attempted.

## Why is this an Adapter?

LLM integration depends on:
- External API calls (OpenAI, Anthropic)
- Network access
- API keys and authentication

These dependencies make it unsuitable for the core SDK, which must be:
- Dependency-free
- Deterministic
- Platform-agnostic

## License

MIT
