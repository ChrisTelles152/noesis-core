# Noesis Web Demo

React-based demo application showcasing the Noesis adaptive learning platform.

## Overview

This demo demonstrates:
- **Attention Tracking** - Real-time gaze tracking with WebGazer.js
- **Mastery Learning** - Progress tracking with FSRS spaced repetition
- **LLM Integration** - AI-powered learning recommendations
- **Real-time Updates** - WebSocket-based event streaming

## Quick Start

```bash
# From repository root
npm install
npm run dev
```

The app starts on `http://localhost:5000` (served by the Express backend).

## Tech Stack

- **React 18** with TypeScript
- **Vite** for development and building
- **Tailwind CSS** for styling
- **shadcn/ui** for UI components
- **TanStack Query** for data fetching
- **Wouter** for routing
- **Framer Motion** for animations

## Project Structure

```
apps/web-demo/
├── src/
│   ├── App.tsx              # Root component with routing
│   ├── main.tsx             # Entry point
│   ├── index.css            # Global styles
│   ├── pages/               # Page components
│   │   ├── Home.tsx         # Landing page
│   │   ├── Dashboard.tsx    # User dashboard
│   │   ├── Demo.tsx         # Interactive demo
│   │   ├── Login.tsx        # Authentication
│   │   └── Documentation.tsx
│   ├── components/          # Reusable components
│   │   ├── ui/              # shadcn/ui primitives
│   │   ├── docs/            # Documentation sections
│   │   ├── Hero.tsx
│   │   ├── Features.tsx
│   │   └── ErrorBoundary.tsx
│   ├── hooks/               # Custom React hooks
│   │   ├── useAuth.tsx      # Authentication state
│   │   ├── useNoesisSDK.ts  # SDK integration
│   │   ├── useAttentionTracking.ts
│   │   ├── useMasteryTracking.ts
│   │   └── useWebSocket.ts
│   ├── lib/                 # Utilities
│   │   ├── api.ts           # API client
│   │   ├── utils.ts         # Helper functions
│   │   └── queryClient.ts   # React Query config
│   └── sdk/                 # SDK integration layer
│       ├── NoesisSDK.ts     # SDK wrapper
│       ├── mastery.ts       # Mastery tracking
│       └── orchestration.ts # LLM orchestration
└── index.html               # HTML template
```

## Features

### Attention Tracking

The demo uses WebGazer.js for real-time eye tracking:

```tsx
import { useAttentionTracking } from './hooks/useAttentionTracking';

function LearningContent() {
  const { attention, isTracking } = useAttentionTracking();

  return (
    <div>
      <p>Attention Score: {Math.round(attention.score * 100)}%</p>
    </div>
  );
}
```

### Mastery Tracking

Track learning progress with spaced repetition:

```tsx
import { useMasteryTracking } from './hooks/useMasteryTracking';

function SkillProgress() {
  const { masteryStates, recordAttempt } = useMasteryTracking();

  const handleAnswer = (correct: boolean) => {
    recordAttempt('skill-id', correct);
  };

  return <ProgressDisplay states={masteryStates} />;
}
```

### LLM Recommendations

Get AI-powered learning suggestions:

```tsx
import { useNoesisSDK } from './hooks/useNoesisSDK';

function LearningPath() {
  const { getNextStep } = useNoesisSDK();

  const handleNext = async () => {
    const recommendation = await getNextStep({
      currentContext: 'algebra-basics',
      masteryLevels: { 'linear-equations': 0.7 }
    });
    // Use recommendation.suggestion
  };
}
```

## Environment Variables

Create a `.env` file:

```env
# Optional: Enable real LLM features
VITE_OPENAI_API_KEY=sk-...
```

## Development

```bash
# Run development server
npm run dev

# Run tests
npm test -- apps/web-demo

# Build for production
npm run build
```

## Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | Home | Landing page with features |
| `/demo` | Demo | Interactive learning demo |
| `/dashboard` | Dashboard | User progress and analytics |
| `/documentation` | Documentation | API and usage docs |
| `/login` | Login | Authentication |
| `/register` | Register | New user signup |

## Customization

### Theming

Tailwind configuration in `tailwind.config.ts`:

```ts
theme: {
  extend: {
    colors: {
      primary: {...},
      // Custom colors
    }
  }
}
```

### Components

UI components are in `src/components/ui/` using shadcn/ui patterns.

## Browser Support

- Chrome 90+ (recommended for WebGazer)
- Firefox 88+
- Safari 14+
- Edge 90+

WebGazer eye tracking requires webcam access and works best in Chrome.
