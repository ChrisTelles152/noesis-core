# Server API Reference

> Auto-documented from Zod schemas in routes.ts

## Authentication

All endpoints except `/api/llm/status` require authentication via session cookie.

## Endpoints

### GET /api/llm/status

Get the current LLM provider status.

**Authentication:** None required

**Response:**
```typescript
{
  activeProvider: string;           // Currently active LLM provider
  configuredProviders: string[];    // All configured providers
  hasLLMProvider: boolean;          // Whether any LLM provider is available
}
```

---

### POST /api/orchestration/next-step

Get a personalized learning recommendation based on learner state.

**Authentication:** Required

**Request Body:**
```typescript
{
  learnerState: {
    attention?: {
      score?: number;          // 0-1, current attention level
      focusStability?: number; // 0-1, focus stability
      cognitiveLoad?: number;  // 0-1, cognitive load estimate
      status?: string;         // tracking status
    };
    mastery?: Array<{
      id: string;              // objective ID
      name: string;            // objective name
      progress: number;        // 0-1, mastery progress
      status: string;          // 'not-started' | 'in-progress' | 'mastered'
    }>;
    timestamp: number;         // Unix timestamp
  };
  context?: string;            // Learning context description
  options?: {
    detail?: 'low' | 'medium' | 'high';  // Response detail level
    format?: 'text' | 'json';            // Response format
  };
}
```

**Response:**
```typescript
{
  suggestion: string;           // Recommended next action
  explanation?: string;         // Why this is recommended
  resourceLinks?: string[];     // Related resources (default: [])
  type: 'llm-generated' | 'fallback';  // Response source
  provider: string;             // LLM provider used
  model: string;                // Model used
}
```

**Error Response (400):**
```typescript
{
  error: string;                // Error message
}
```

---

### POST /api/orchestration/engagement

Get an engagement suggestion when attention is low.

**Authentication:** Required

**Request Body:**
```typescript
{
  attentionScore?: number;      // 0-1, current attention (default: 0.3)
  context?: string;             // Learning context
  previousInterventions?: string[];  // Previous intervention types tried
}
```

**Response:**
```typescript
{
  message: string;              // Engagement message
  type: string;                 // Intervention type
  source: 'llm-generated' | 'fallback';  // Response source
  provider: string;             // LLM provider used
  model: string;                // Model used
}
```

---

### GET /api/analytics/attention

Get attention tracking events for the authenticated user.

**Authentication:** Required

**Response:**
```typescript
Array<{
  id: number;
  userId: number;
  type: 'attention';
  data: {
    attentionScore?: number;
    [key: string]: string | number | boolean | undefined;
  };
  timestamp: string;           // ISO 8601 datetime
}>
```

---

### GET /api/analytics/mastery

Get mastery tracking events for the authenticated user.

**Authentication:** Required

**Response:**
```typescript
Array<{
  id: number;
  userId: number;
  type: 'mastery';
  data: {
    objectiveId?: string;
    progress?: number;
    result?: number;
    [key: string]: string | number | boolean | undefined;
  };
  timestamp: string;           // ISO 8601 datetime
}>
```

---

### GET /api/analytics/summary

Get aggregated analytics summary for the authenticated user.

**Authentication:** Required

**Response:**
```typescript
{
  userId: number;
  totalEvents: number;
  eventCounts: {
    attention: number;
    mastery: number;
    recommendations: number;
    engagements: number;
  };
  averageAttention: number;    // 0-1, rounded to 2 decimals
  recentEvents: Array<LearningEvent>;  // Last 10 events, newest first
  llmProvider: string;
}
```

---

### POST /api/learning/events

Record a learning event.

**Authentication:** Required

**Request Body:**
```typescript
{
  type: string;                // Event type (e.g., 'attention', 'mastery')
  data: {
    context?: string;
    attentionScore?: number;
    recommendation?: string;
    intervention?: string;
    objectiveId?: string;
    progress?: number;
    result?: number;
    [key: string]: string | number | boolean | undefined;
  };
  timestamp?: string;          // ISO 8601 datetime (default: now)
}
```

**Response:**
```typescript
{
  id: number;
  userId: number;
  type: string;
  data: object;
  timestamp: string;           // ISO 8601 datetime
}
```

---

### GET /api/csrf-token

Get a fresh CSRF token for state-changing requests.

**Authentication:** None required (creates session if needed)

**Response:**
```typescript
{
  token: string;               // CSRF token to include in X-CSRF-Token header
}
```

---

## Common Validation Schemas

These schemas are available for reuse in custom middleware:

### Pagination
```typescript
{
  page: number;    // Positive integer, default: 1
  limit: number;   // Positive integer, max: 100, default: 20
}
```

### ID Parameter
```typescript
{
  id: number;      // Positive integer
}
```

### Date Range
```typescript
{
  startDate?: string;  // ISO 8601 datetime
  endDate?: string;    // ISO 8601 datetime
}
```

---

## Error Codes

Standard error codes returned by the API (from `errors.ts`):

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_REQUIRED` | 401 | Authentication required |
| `AUTH_INVALID_CREDENTIALS` | 401 | Invalid username or password |
| `AUTH_SESSION_EXPIRED` | 401 | Session has expired |
| `VALIDATION_FAILED` | 400 | Request validation failed |
| `VALIDATION_PASSWORD_WEAK` | 400 | Password does not meet complexity requirements |
| `VALIDATION_USERNAME_TAKEN` | 400 | Username already exists |
| `NOT_FOUND` | 404 | Resource not found |
| `FORBIDDEN` | 403 | Access denied |
| `INTERNAL_ERROR` | 500 | Internal server error |

**Error Response Format:**
```typescript
{
  error: string;       // Human-readable error message
  code?: string;       // Machine-readable error code
  details?: object;    // Additional error details (validation errors, etc.)
}
```

---

## CSRF Protection

State-changing requests (POST, PUT, DELETE) require a valid CSRF token.

1. Get a token from `GET /api/csrf-token`
2. Include it in the `X-CSRF-Token` header for subsequent requests
3. Alternatively, include it in request body as `_csrf` or query string

**Example:**
```javascript
// Get CSRF token
const { token } = await fetch('/api/csrf-token').then(r => r.json());

// Use in subsequent request
await fetch('/api/learning/events', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': token
  },
  body: JSON.stringify({ type: 'mastery', data: { ... } })
});
```
