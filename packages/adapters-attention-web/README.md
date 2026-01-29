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

## Browser Compatibility

| Browser | WebGazer Support | Notes |
|---------|-----------------|-------|
| Chrome 80+ | ✅ Full | Recommended |
| Firefox 75+ | ✅ Full | |
| Safari 14+ | ⚠️ Partial | Requires user gesture for camera |
| Edge 80+ | ✅ Full | Chromium-based |
| Mobile browsers | ❌ Limited | Eye tracking unreliable on mobile |

### Requirements

- **HTTPS** - Webcam access requires secure context
- **Webcam permission** - User must grant camera access
- **Sufficient lighting** - Eye tracking needs good lighting

## Privacy Considerations

### Data Collection

This adapter processes webcam video for eye tracking but:

- **No video is stored or transmitted** - Processing happens locally in the browser
- **No images leave the device** - WebGazer.js runs entirely client-side
- **Gaze coordinates only** - Only derived gaze points are used, not raw video

### User Consent

Always obtain user consent before enabling eye tracking:

```typescript
// Example consent flow
const consent = await showConsentDialog({
  title: 'Enable Eye Tracking?',
  description: 'We use your webcam to track where you look on the page. Video is processed locally and never stored or transmitted.',
});

if (consent) {
  await tracker.startTracking(element);
}
```

### Permissions

The adapter requests the `camera` permission via `navigator.mediaDevices.getUserMedia()`. Users can revoke this permission at any time through browser settings.

## Error Handling

```typescript
try {
  await tracker.startTracking(element);
} catch (error) {
  if (error.name === 'NotAllowedError') {
    // User denied camera permission
  } else if (error.name === 'NotFoundError') {
    // No camera available
  } else if (error.name === 'NotReadableError') {
    // Camera in use by another application
  }
}
```

## Fallback Mode

When WebGazer is unavailable (no camera, permission denied, mobile), the adapter automatically falls back to simulated attention tracking:

```typescript
const tracker = new AttentionTracker({
  useRealGazeTracking: true,  // Will fallback if unavailable
});

// Check if real tracking is active
if (tracker.isUsingRealTracking()) {
  console.log('Using WebGazer');
} else {
  console.log('Using simulation fallback');
}
```

## License

MIT
