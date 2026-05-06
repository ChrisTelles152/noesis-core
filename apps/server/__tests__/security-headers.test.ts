/**
 * Security-header configuration tests (Phase D3)
 *
 * Verifies that the COEP relaxation that previously shipped unconditionally
 * (with the comment "Needed for WebGazer") is now opt-in:
 *  - With ENABLE_REAL_GAZE_TRACKING unset/'false', COEP defaults to require-corp.
 *  - Only when ENABLE_REAL_GAZE_TRACKING === 'true' is COEP relaxed.
 *
 * The unit-level test below exercises buildHelmetOptions directly. The
 * integration-level test mounts an Express app with the helmet middleware
 * and asserts the actual response header — which is what end users see.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';
import { buildHelmetOptions, isRealGazeTrackingEnabled } from '../security-headers';

describe('Phase D3: buildHelmetOptions — COEP is opt-in', () => {
  it('crossOriginEmbedderPolicy=true (default require-corp) when WebGazer disabled', () => {
    const opts = buildHelmetOptions({ production: false, enableRealGazeTracking: false });
    // helmet's `true` value enables the strict default (`require-corp`).
    expect(opts.crossOriginEmbedderPolicy).toBe(true);
  });

  it('crossOriginEmbedderPolicy=false (relaxed) only when WebGazer enabled', () => {
    const opts = buildHelmetOptions({ production: false, enableRealGazeTracking: true });
    expect(opts.crossOriginEmbedderPolicy).toBe(false);
  });

  it('CSP enabled in production, disabled in dev — independent of WebGazer flag', () => {
    const prodOff = buildHelmetOptions({ production: true, enableRealGazeTracking: false });
    const prodOn = buildHelmetOptions({ production: true, enableRealGazeTracking: true });
    const devOff = buildHelmetOptions({ production: false, enableRealGazeTracking: false });
    const devOn = buildHelmetOptions({ production: false, enableRealGazeTracking: true });

    expect(prodOff.contentSecurityPolicy).not.toBe(false);
    expect(prodOn.contentSecurityPolicy).not.toBe(false);
    expect(devOff.contentSecurityPolicy).toBe(false);
    expect(devOn.contentSecurityPolicy).toBe(false);
  });

  it('crossOriginOpenerPolicy is unchanged across both modes', () => {
    const off = buildHelmetOptions({ production: false, enableRealGazeTracking: false });
    const on = buildHelmetOptions({ production: false, enableRealGazeTracking: true });
    expect(off.crossOriginOpenerPolicy).toEqual({ policy: 'same-origin-allow-popups' });
    expect(on.crossOriginOpenerPolicy).toEqual({ policy: 'same-origin-allow-popups' });
  });
});

describe('Phase D3: isRealGazeTrackingEnabled — strict equality on opt-in', () => {
  const original = process.env.ENABLE_REAL_GAZE_TRACKING;

  beforeEach(() => {
    delete process.env.ENABLE_REAL_GAZE_TRACKING;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.ENABLE_REAL_GAZE_TRACKING;
    } else {
      process.env.ENABLE_REAL_GAZE_TRACKING = original;
    }
  });

  it('returns false when env var is unset', () => {
    expect(isRealGazeTrackingEnabled()).toBe(false);
  });

  it("returns false for non-'true' values (matches client-side strict equality)", () => {
    for (const value of ['', 'false', 'TRUE', 'yes', '1', 'webgazer']) {
      process.env.ENABLE_REAL_GAZE_TRACKING = value;
      expect(isRealGazeTrackingEnabled(), `value=${value}`).toBe(false);
    }
  });

  it("returns true only for 'true' exactly", () => {
    process.env.ENABLE_REAL_GAZE_TRACKING = 'true';
    expect(isRealGazeTrackingEnabled()).toBe(true);
  });
});

describe('Phase D3: end-to-end COEP header behaviour through helmet middleware', () => {
  function buildApp(enableRealGazeTracking: boolean) {
    const app = express();
    app.use(helmet(buildHelmetOptions({ production: false, enableRealGazeTracking })));
    app.get('/', (_req, res) => res.send('ok'));
    return app;
  }

  it('emits Cross-Origin-Embedder-Policy: require-corp when WebGazer disabled', async () => {
    const app = buildApp(false);
    const res = await request(app).get('/');
    expect(res.headers['cross-origin-embedder-policy']).toBe('require-corp');
  });

  it('does NOT emit Cross-Origin-Embedder-Policy when WebGazer enabled', async () => {
    const app = buildApp(true);
    const res = await request(app).get('/');
    // helmet with crossOriginEmbedderPolicy: false omits the header entirely.
    expect(res.headers['cross-origin-embedder-policy']).toBeUndefined();
  });

  it('Cross-Origin-Opener-Policy is set in both modes', async () => {
    for (const flag of [false, true]) {
      const app = buildApp(flag);
      const res = await request(app).get('/');
      expect(res.headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
    }
  });
});
