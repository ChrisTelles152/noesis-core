/**
 * Security-header configuration (Phase D3)
 *
 * Helmet middleware options are built here so they can be tested in
 * isolation — apps/server/index.ts has top-level side effects (it starts the
 * HTTP server on import), which makes it awkward to spin up for tests.
 *
 * The most consequential option here is `crossOriginEmbedderPolicy`. The
 * legacy config relaxed it unconditionally with the comment "Needed for
 * WebGazer", which made every deployment carry a weaker COEP posture even
 * when WebGazer was not in use. INTENTION.md keeps WebGazer opt-in only,
 * so the relaxation is now opt-in too: it activates exclusively when the
 * server is configured for real gaze tracking via the
 * `ENABLE_REAL_GAZE_TRACKING` env var.
 */

import type { HelmetOptions } from 'helmet';

export interface HelmetConfigOpts {
  /** Whether the process is running in production. */
  production: boolean;
  /**
   * Whether real (webcam-driven) gaze tracking is enabled for this
   * deployment. When `true`, COEP is relaxed because WebGazer.js needs to
   * load cross-origin script sources without `require-corp`. When `false`
   * (the default), the standard helmet COEP header (`require-corp`) applies.
   */
  enableRealGazeTracking: boolean;
}

/**
 * Build the helmet middleware options object from the deployment env.
 *
 * Pure function — given the same opts, returns the same config. Use this in
 * `apps/server/index.ts` and from any test that needs to reason about the
 * security posture without booting the server.
 */
export function buildHelmetOptions(opts: HelmetConfigOpts): HelmetOptions {
  return {
    contentSecurityPolicy: opts.production
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'", 'wss:', 'https://api.openai.com', 'https://api.anthropic.com'],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
          },
        }
      : false, // CSP disabled in development for easier debugging
    // COEP: relax only when WebGazer is opted in. The default (require-corp)
    // is the safer posture and is now what every non-WebGazer deployment
    // gets. Removing the unconditional relaxation closes the audit gap from
    // PRODUCTION_READINESS.md §3.6.
    crossOriginEmbedderPolicy: !opts.enableRealGazeTracking,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  };
}

/**
 * Read the ENABLE_REAL_GAZE_TRACKING env var with strict-equality semantics.
 *
 * Mirrors the client-side rule in `apps/web-demo/src/hooks/useAttentionTracking.ts`:
 * any value other than the literal string `'true'` is treated as off,
 * including unset, empty, and 'false'. The asymmetry is deliberate — the
 * safer posture is the default-by-omission.
 */
export function isRealGazeTrackingEnabled(): boolean {
  return process.env.ENABLE_REAL_GAZE_TRACKING === 'true';
}
