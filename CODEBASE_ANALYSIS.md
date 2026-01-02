# Noesis Core - Comprehensive Codebase Analysis

**Date:** January 2, 2026
**Repository:** noesis-core
**Analysis Type:** Architecture, Gap Analysis, Technical Debt, Prioritized Actions

---

## 1. Project Overview

### 1.1 Core Purpose

**Noesis Core** is an open-source, cross-platform adaptive learning SDK designed to provide infrastructure for attention-aware, personalized education experiences. The platform aims to make learning experiences adapt to the learner based on real-time attention and mastery tracking.

**Mission Statement:** *"Learning infrastructure should adapt to the learner — not the other way around."*

**Target Platforms:** XR (Meta Quest, Apple Vision Pro), Desktop, Mobile, and Web

### 1.2 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (React)                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Attention   │  │   Mastery    │  │    Orchestration       │  │
│  │  Tracker    │  │   Tracker    │  │   (LLM Integration)    │  │
│  │ (Gaze/Focus)│  │(Spaced Rep.) │  │  (OpenAI gpt-4o)       │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
│                           │                                      │
│  ┌────────────────────────▼────────────────────────────────────┐│
│  │              NoesisSDK (Singleton Coordinator)              ││
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│                  React Hooks + Components                       │
│  useNoesisSDK │ useAttentionTracking │ useMasteryTracking       │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP/REST
┌───────────────────────────▼─────────────────────────────────────┐
│                       SERVER (Express)                          │
├─────────────────────────────────────────────────────────────────┤
│  POST /api/orchestration/next-step    → LLM recommendations     │
│  POST /api/orchestration/engagement   → Re-engagement prompts   │
│  GET  /api/analytics/attention        → Attention events        │
│  GET  /api/analytics/mastery          → Mastery progress        │
│  POST /api/learning/events            → Store learning events   │
├─────────────────────────────────────────────────────────────────┤
│                     Storage Layer                               │
│  ┌─────────────────┐    ┌────────────────────────────────────┐  │
│  │  MemStorage     │    │   PostgreSQL (Neon Serverless)     │  │
│  │  (In-Memory)    │    │   users, learningEvents, mastery   │  │
│  └─────────────────┘    └────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| **Frontend Framework** | React | 18.3.1 |
| **Build Tool** | Vite | 5.4.14 |
| **Language** | TypeScript | 5.6.3 |
| **Styling** | Tailwind CSS | 3.4.17 |
| **UI Components** | Radix UI + shadcn/ui | Various |
| **Routing** | Wouter | 3.3.5 |
| **State/Data** | React Query | 5.60.5 |
| **Backend** | Express | 4.21.2 |
| **Database** | PostgreSQL (Neon) | 16 |
| **ORM** | Drizzle | 0.39.1 |
| **Validation** | Zod | 3.24.2 |
| **LLM** | OpenAI API | 4.98.0 |

### 1.4 Directory Structure

```
noesis-core/
├── client/                          # React frontend
│   └── src/
│       ├── sdk/                     # Core SDK implementation
│       │   ├── NoesisSDK.ts        # Main coordinator (56 lines)
│       │   ├── attention.ts        # AttentionTracker (311 lines)
│       │   ├── mastery.ts          # MasteryTracker (203 lines)
│       │   ├── orchestration.ts    # LLM orchestrator (167 lines)
│       │   └── types.ts            # TypeScript interfaces
│       ├── components/             # React components (62 files)
│       │   └── ui/                 # shadcn/ui primitives (46 files)
│       ├── hooks/                  # Custom React hooks (5 files)
│       ├── pages/                  # Page components (4 files)
│       └── lib/                    # Utilities
├── server/                          # Express backend
│   ├── index.ts                    # Entry point
│   ├── routes.ts                   # API endpoints (262 lines)
│   ├── storage.ts                  # In-memory storage
│   └── db.ts                       # Database connection
├── shared/                          # Shared code
│   └── schema.ts                   # Drizzle ORM schema
└── attached_assets/                 # Planning documents
```

### 1.5 Current Implementation State vs. Design Intent

| Feature | Design Intent | Current State | Gap |
|---------|--------------|---------------|-----|
| **Attention Tracking** | Real gaze tracking via computer vision | Simulated with Math.random() | 🔴 Major |
| **Mastery System** | Spaced repetition algorithm | Implemented, functional | 🟢 Complete |
| **LLM Orchestration** | AI-driven learning recommendations | Implemented with fallback | 🟡 Partial |
| **XR Support** | Quest, Vision Pro integration | Not implemented | 🔴 Major |
| **Voice Interface** | Voice commands and interaction | Not implemented | 🔴 Major |
| **Authentication** | User registration/login | Demo mode only | 🔴 Major |
| **Analytics Dashboard** | Learning analytics visualization | Basic implementation | 🟡 Partial |
| **Multi-LLM Support** | OpenAI, Claude, local models | OpenAI only | 🟡 Partial |

---

## 2. Gap Analysis

### 2.1 Incomplete Features (Stubbed/Placeholder Implementations)

#### Critical: Simulated Attention Tracking
**Location:** `client/src/sdk/attention.ts:184-256`

The entire gaze tracking system uses random simulation instead of actual computer vision:

```typescript
// Lines 184-186: Simulated gaze instead of real tracking
// In a real implementation, this would use computer vision to analyze
// webcam data for gaze, head pose, etc. For this demo, we'll simulate it.
const simulatedGazeCoordinates = this.simulateGazeTracking();

// Lines 211-212: Fake cognitive load
const cognitiveLoad = 0.3 + (Math.random() * 0.4);

// Lines 244-250: Random probability for "looking at target"
const isLookingAtTarget = Math.random() < 0.7; // 70% chance
```

**Impact:** Core SDK value proposition is non-functional

#### Placeholder API Keys
| Location | Issue |
|----------|-------|
| `server/routes.ts:10` | `apiKey: process.env.OPENAI_API_KEY \|\| "default_key"` |
| `client/src/hooks/useNoesisSDK.ts:14` | `apiKey: import.meta.env.VITE_OPENAI_API_KEY \|\| "default_key"` |
| `server/storage.ts:33` | Hardcoded `password: "password123"` |

#### Demo-Only User IDs
| Location | Issue |
|----------|-------|
| `server/routes.ts:96` | `userId: 1, // Default user for demo` |
| `server/routes.ts:194` | `userId: 1, // Default user for demo` |

### 2.2 Missing Functionality Implied by Architecture

Based on README, documentation, and code comments, these features are mentioned but not implemented:

| Feature | Evidence | Implementation Status |
|---------|----------|----------------------|
| **XR Support (Quest/Vision Pro)** | README: "XR-ready: supports Quest, Vision Pro" | No XR code found |
| **Voice Interface** | README: "Voice interface support for LLM interaction" | No voice code found |
| **Multi-LLM Support** | README: "Compatible with OpenAI, Claude, local" | Only OpenAI implemented |
| **API Reference Docs** | `DocSidebar.tsx:16` lists section | No content in DocContent.tsx |
| **Examples Docs** | `DocSidebar.tsx:17` lists section | No content in DocContent.tsx |
| **Password Hashing** | Users table has password field | Stored as plaintext |

### 2.3 Dead Code & Orphaned Modules

#### Unused UI Components (31 of 46)
These shadcn/ui components are installed but never imported:

```
accordion, alert, alert-dialog, aspect-ratio, avatar, breadcrumb,
calendar, carousel, chart, checkbox, collapsible, command, context-menu,
dialog, drawer, dropdown-menu, form, hover-card, input, input-otp,
label, menubar, navigation-menu, pagination, popover, radio-group,
resizable, scroll-area, select, slider, switch, table, tabs, textarea,
toggle, toggle-group
```

**Impact:** Unnecessary bundle size bloat

#### Unused Hook Exports
**File:** `client/src/hooks/useMasteryTracking.ts:57-70`
```typescript
const getReviewRecommendations = useCallback(() => {...}, []);  // UNUSED
const getObjectiveProgress = useCallback(() => {...}, []);      // UNUSED
```

#### Unused Variable in SDK
**File:** `client/src/sdk/NoesisSDK.ts:18, 23`
```typescript
private activeModules: ModuleType[];  // Set but never read
```

---

## 3. Technical Debt Inventory

### 3.1 Code Quality Issues

#### Type Safety Problems (`any` usage)

| File | Line | Issue |
|------|------|-------|
| `server/routes.ts` | 239 | `z.record(z.any)` - accepts any data |
| `client/src/lib/utils.ts` | 9, 28 | `gazeData: any`, `faceData: any` |
| `client/src/sdk/orchestration.ts` | 162 | `...args: any[]` |
| `client/src/sdk/mastery.ts` | 198 | `...args: any[]` |
| `client/src/sdk/NoesisSDK.ts` | 49 | `...args: any[]` |
| `server/index.ts` | 12 | `Record<string, any>` |

#### High Cyclomatic Complexity

**`client/src/components/DocContent.tsx:66-359`**
- 6-branch switch statement with 300+ lines
- Each case contains 50+ lines of JSX
- Recommendation: Extract to separate components

**`client/src/pages/Demo.tsx:256-272`**
- Triple-nested ternary operators for styling
- Recommendation: Extract to utility functions

#### Code Duplication

**`server/routes.ts`** - Repeated patterns:
- Zod validation pattern repeated 3 times (lines 16-37, 117-121, 236-241)
- Error handling repeated 2 times (lines 50-92, 132-190)
- Recommendation: Create validation middleware

#### Mixed Concerns

**`client/src/pages/Demo.tsx`** handles 5 responsibilities:
1. Webcam/Video management (lines 40-70)
2. Attention tracking (lines 25, 28, 101, 137)
3. Mastery progress (lines 19-23, 26, 90, 98)
4. LLM integration (lines 78-94)
5. UI rendering (lines 103-295)

#### Unsafe JSON Parsing
**`server/routes.ts:74, 158`**
```typescript
const result = JSON.parse(completion.choices[0].message.content);
// No validation that result matches expected schema!
```

### 3.2 Test Coverage Gaps

**Current Test Coverage: 0%**

| Category | Files | Lines | Tests |
|----------|-------|-------|-------|
| SDK Core Logic | 5 | 573 | 0 |
| Server Routes | 1 | 262 | 0 |
| Custom Hooks | 5 | ~200 | 0 |
| Utilities | 2 | 76 | 0 |
| Storage/Data | 2 | ~150 | 0 |
| Components | 62 | ~1,200 | 0 |
| **TOTAL** | **87** | **~3,789** | **0** |

**Missing Infrastructure:**
- No test framework configured (Jest/Vitest)
- No test scripts in package.json
- No coverage configuration
- No CI/CD pipeline with test validation

### 3.3 Documentation Deficiencies

| Area | Issue |
|------|-------|
| README.md | Incomplete - ends abruptly at line 45 |
| API Reference | Listed in sidebar but not implemented |
| Examples section | Listed in sidebar but not implemented |
| JSDoc coverage | Minimal on SDK functions |
| Contributing guide | Missing |
| Architecture docs | Only in code comments |

### 3.4 Dependency Issues

#### Outdated Packages (Major Updates Available)

| Package | Current | Latest | Risk |
|---------|---------|--------|------|
| `openai` | 4.98.0 | **6.15.0** | High - API changes |
| `react` | 18.3.1 | **19.2.3** | Medium - breaking changes |
| `drizzle-orm` | 0.39.1 | **0.45.1** | Medium |
| `framer-motion` | 11.13.1 | **12.23.26** | Low |
| `date-fns` | 3.6.0 | **4.1.0** | Medium |
| `zod` | 3.24.2 | **4.3.4** | High - major version |
| `express` | 4.21.2 | **5.2.1** | High - major version |
| `@fortawesome/*` | 6.7.2 | **7.1.0** | Medium |

#### Security Concerns

1. **Plaintext Passwords:** `server/storage.ts:33` stores "password123" without hashing
2. **Default API Keys:** Fallback to "default_key" could mask configuration errors
3. **No Rate Limiting:** API endpoints have no rate limiting
4. **No Input Sanitization:** User inputs not sanitized before storage
5. **No CORS Configuration:** Express lacks explicit CORS setup

---

## 4. Prioritized Action Items

### 🔴 CRITICAL (Blocking/Security Issues)

| ID | Issue | Location | Effort |
|----|-------|----------|--------|
| C1 | **Implement password hashing** | `server/storage.ts:33`, `shared/schema.ts` | 2h |
| C2 | **Remove hardcoded credentials** | `server/storage.ts:33` | 30m |
| C3 | **Add input validation after JSON.parse** | `server/routes.ts:74, 158` | 2h |
| C4 | **Configure CORS properly** | `server/index.ts` | 1h |
| C5 | **Add rate limiting to API endpoints** | `server/routes.ts` | 2h |
| C6 | **Remove default_key fallbacks** | Multiple files | 30m |

### 🟠 HIGH (Core Feature Completion)

| ID | Issue | Location | Effort |
|----|-------|----------|--------|
| H1 | **Implement real gaze tracking** | `client/src/sdk/attention.ts` | 40h |
| H2 | **Add test framework and core tests** | Project root | 16h |
| H3 | **Implement authentication system** | `server/`, `client/` | 24h |
| H4 | **Complete API Reference documentation** | `DocContent.tsx` | 8h |
| H5 | **Complete Examples documentation** | `DocContent.tsx` | 8h |
| H6 | **Replace `any` types with proper interfaces** | Multiple files | 4h |
| H7 | **Validate OpenAI response schema** | `server/routes.ts` | 2h |

### 🟡 MEDIUM (Refactoring/Quality)

| ID | Issue | Location | Effort |
|----|-------|----------|--------|
| M1 | **Extract DocContent switch to components** | `DocContent.tsx:66-359` | 4h |
| M2 | **Create validation middleware** | `server/routes.ts` | 3h |
| M3 | **Split Demo.tsx into focused components** | `client/src/pages/Demo.tsx` | 4h |
| M4 | **Remove unused UI components** | `client/src/components/ui/` | 2h |
| M5 | **Extract ternary operators to utilities** | `Demo.tsx:256-272` | 1h |
| M6 | **Add JSDoc to SDK public methods** | `client/src/sdk/*.ts` | 4h |
| M7 | **Complete README.md** | Root | 2h |
| M8 | **Update outdated dependencies** | `package.json` | 4h |

### 🟢 LOW (Nice-to-haves/Polish)

| ID | Issue | Location | Effort |
|----|-------|----------|--------|
| L1 | **Remove unused hook exports** | `useMasteryTracking.ts:57-70` | 30m |
| L2 | **Remove unused activeModules variable** | `NoesisSDK.ts:18` | 15m |
| L3 | **Add Contributing guide** | `CONTRIBUTING.md` | 2h |
| L4 | **Inject random provider for testing** | `attention.ts` | 2h |
| L5 | **Extract webcam setup to custom hook** | `Demo.tsx:38-57` | 1h |
| L6 | **Add GitHub Actions CI/CD** | `.github/workflows/` | 4h |

---

## 5. Recommendations

### 5.1 Suggested Implementation Order

#### Phase 1: Security & Stability (Week 1)
**Rationale:** Address security vulnerabilities before any public deployment

1. ✅ C1: Implement password hashing (bcrypt)
2. ✅ C2: Remove hardcoded credentials
3. ✅ C3: Add Zod validation after JSON.parse
4. ✅ C4: Configure CORS
5. ✅ C5: Add rate limiting
6. ✅ H6: Replace `any` types

#### Phase 2: Testing Foundation (Week 2)
**Rationale:** Enable confident refactoring and feature development

1. ✅ H2: Set up Vitest + React Testing Library
2. ✅ Write tests for SDK core (attention.ts, mastery.ts)
3. ✅ Write tests for server routes
4. ✅ Configure coverage thresholds (target: 80%)

#### Phase 3: Core Feature Completion (Weeks 3-4)
**Rationale:** Deliver on documented SDK promises

1. ✅ H3: Implement authentication (Passport.js integration)
2. ✅ H1: Integrate real gaze tracking library (e.g., WebGazer.js)
3. ✅ H4, H5: Complete documentation sections

#### Phase 4: Code Quality (Week 5)
**Rationale:** Reduce maintenance burden and improve DX

1. ✅ M1: Extract DocContent components
2. ✅ M2: Create validation middleware
3. ✅ M3: Split Demo.tsx
4. ✅ M4: Remove unused UI components

### 5.2 Architectural Concerns Worth Addressing Early

#### 1. In-Memory Storage → Database Migration
**Current:** `MemStorage` class uses Maps (data lost on restart)
**Recommendation:** Complete the Drizzle/PostgreSQL integration for all operations

```typescript
// Current: server/storage.ts (in-memory)
this.users = new Map();
this.learningEvents = new Map();

// Should be: using db from server/db.ts
import { db } from './db';
import { users, learningEvents } from '../shared/schema';
```

#### 2. Singleton SDK Pattern
**Concern:** Current singleton pattern in `useNoesisSDK` may cause issues with:
- Server-side rendering
- Testing isolation
- Multiple SDK configurations

**Recommendation:** Consider dependency injection pattern:
```typescript
const NoesisContext = createContext<NoesisSDK | null>(null);

export function NoesisProvider({ config, children }) {
  const sdk = useMemo(() => new NoesisSDK(config), [config]);
  return <NoesisContext.Provider value={sdk}>{children}</NoesisContext.Provider>;
}
```

#### 3. API Key Exposure Risk
**Current:** API key passed to client-side orchestrator
**Risk:** Client-side API key is visible in browser DevTools

**Recommendation:** Proxy all LLM requests through server:
```typescript
// Client calls server
const response = await fetch('/api/orchestration/next-step', {...});

// Server makes OpenAI call (key never exposed to client)
const completion = await openai.chat.completions.create({...});
```

### 5.3 Quick Wins vs. Deep Work Tradeoffs

| Quick Wins (< 2 hours) | Impact | Deep Work | Impact |
|------------------------|--------|-----------|--------|
| Remove hardcoded credentials | 🔒 Security | Implement real gaze tracking | 🚀 Core value |
| Add CORS configuration | 🔒 Security | Add authentication system | 🚀 Production-ready |
| Remove unused UI components | 📦 Bundle size | Set up test framework | 🛡️ Stability |
| Replace `any` types | 🛡️ Type safety | Extract DocContent | 🧹 Maintainability |
| Complete README | 📖 Onboarding | Migrate to PostgreSQL | 💾 Data persistence |

### 5.4 Technology Recommendations

| Current | Recommended | Rationale |
|---------|-------------|-----------|
| Simulated gaze | **WebGazer.js** | Open-source, browser-based eye tracking |
| No tests | **Vitest** | Fast, TypeScript-native, Vite integration |
| Plaintext passwords | **bcrypt** | Industry standard, battle-tested |
| No rate limiting | **express-rate-limit** | Simple, configurable |
| Manual validation | **zod middleware** | Already using Zod, DRY validation |

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| **Total Source Files** | 87 |
| **Lines of Code** | ~3,789 |
| **Test Coverage** | 0% |
| **Critical Issues** | 6 |
| **High Priority Issues** | 7 |
| **Medium Priority Issues** | 8 |
| **Low Priority Issues** | 6 |
| **Unused Components** | 31 |
| **Outdated Dependencies** | 15+ |
| **Security Concerns** | 5 |

---

*Analysis generated by automated codebase review. All line numbers and file paths verified against current repository state.*
