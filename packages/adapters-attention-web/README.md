# @noesis/adapters-attention-web

Web-based attention tracking adapter for the Noesis learning system.

## Overview

This adapter provides attention tracking capabilities using:
- **WebGazer.js** - ML-based eye tracking in the browser
- **Webcam simulation** - Fallback when eye tracking is unavailable

## Important Note

**Attention tracking is OPTIONAL.** The core Noesis learning loop does not require attention data. Attention provides additional context for learning recommendations but the mastery-based system works without it.

## Installation

```bash
npm install @noesis/adapters-attention-web
```

## Usage

```typescript
import { AttentionTracker } from '@noesis/adapters-attention-web';

const tracker = new AttentionTracker({
  useRealGazeTracking: true,  // Use WebGazer.js
  showGazePoints: false,       // Debug visualization
  trackingInterval: 500,       // Update every 500ms
});

// Start tracking
await tracker.startTracking(document.getElementById('content'));

// Listen for attention changes
tracker.onAttentionChange((data) => {
  console.log('Attention score:', data.score);
  console.log('Focus stability:', data.focusStability);
});

// Stop tracking
await tracker.stopTracking();
```

## Why is this an Adapter?

Attention tracking depends on:
- Browser DOM APIs
- Webcam/MediaDevices APIs
- WebGazer.js (ML library)

These dependencies make it unsuitable for the core SDK, which must be:
- Dependency-free
- Platform-agnostic
- Runnable in any JavaScript environment

## API

### AttentionTracker

Main class for attention tracking.

#### Methods

- `startTracking(element, options?)` - Start tracking attention on an element
- `stopTracking()` - Stop tracking and release resources
- `getCurrentData()` - Get current attention data
- `onAttentionChange(callback)` - Register callback for attention updates

### WebGazerAdapter

Low-level wrapper around WebGazer.js.

## License

MIT
