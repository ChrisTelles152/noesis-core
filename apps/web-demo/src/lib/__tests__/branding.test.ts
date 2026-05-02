/**
 * Brand assets tests (Phase G2 + G3)
 *
 * G2 — verifies the spiral-eye placeholder logo:
 *   - file exists at the expected path
 *   - main.tsx wires it as the favicon at boot
 *   - Hero.tsx references it as an inline image
 *
 * G3 — verifies the dual font system:
 *   - Tailwind theme exposes fontFamily.sans (Inter) and fontFamily.serif
 *     (Source Serif Pro) as the locked brand typefaces
 *   - index.html loads both via the Google Fonts CDN
 *
 * The asserts are deliberately mechanical (file existence + grep) so the
 * tests double as the contract: a future contributor who renames the asset
 * or drops the Google Fonts link gets a clear, named failure.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindConfig from '../../../../../tailwind.config';

const PROJECT_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');
const SPIRAL_EYE_PATH = resolve(PROJECT_ROOT, 'apps/web-demo/src/assets/spiral-eye.svg');
const HERO_PATH = resolve(PROJECT_ROOT, 'apps/web-demo/src/components/Hero.tsx');
const MAIN_PATH = resolve(PROJECT_ROOT, 'apps/web-demo/src/main.tsx');
const INDEX_HTML_PATH = resolve(PROJECT_ROOT, 'apps/web-demo/index.html');

describe('Phase G2: spiral-eye logo wiring', () => {
  it('SVG file exists at apps/web-demo/src/assets/spiral-eye.svg', () => {
    expect(existsSync(SPIRAL_EYE_PATH)).toBe(true);
  });

  it('SVG is well-formed and contains the spiral-eye composition (circle + polyline + pupil)', () => {
    const svg = readFileSync(SPIRAL_EYE_PATH, 'utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 100 100"');
    // The three composition elements (eye boundary + spiral iris + pupil).
    expect(svg.match(/<circle/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(svg).toContain('<polyline');
    // Stroke uses currentColor so the logo inherits the parent text color
    // (which routes through the brand palette via index.css).
    expect(svg).toContain('currentColor');
    // Accessibility — must announce as Noesis to assistive tech.
    expect(svg).toContain('aria-label="Noesis"');
  });

  it('Hero.tsx imports and renders the spiral-eye asset', () => {
    const hero = readFileSync(HERO_PATH, 'utf8');
    expect(hero).toContain("from '@/assets/spiral-eye.svg'");
    // Rendered as an <img> tag with the imported URL.
    expect(hero).toMatch(/<img[^>]*src=\{spiralEyeUrl\}/);
  });

  it('main.tsx imports the asset and sets it as the favicon at boot', () => {
    const main = readFileSync(MAIN_PATH, 'utf8');
    expect(main).toContain("from '@/assets/spiral-eye.svg'");
    // Document the wiring contract — boot sequence creates a <link rel="icon">.
    expect(main).toContain("rel = 'icon'");
    expect(main).toContain("'image/svg+xml'");
  });
});

describe('Phase G3: dual font system', () => {
  it('Tailwind theme exposes fontFamily.sans (Inter) and fontFamily.serif (Source Serif)', () => {
    const theme = (
      tailwindConfig as {
        theme?: { extend?: { fontFamily?: Record<string, string[]> } };
      }
    ).theme;
    const fontFamily = theme?.extend?.fontFamily ?? {};

    expect(fontFamily.sans?.[0]).toBe('Inter');
    // Source Serif Pro stack first; serif fallback last.
    expect(fontFamily.serif?.[0]).toContain('Source Serif');
  });

  it('index.html loads Inter and Source Serif from Google Fonts', () => {
    const html = readFileSync(INDEX_HTML_PATH, 'utf8');
    expect(html).toContain('fonts.googleapis.com');
    expect(html).toContain('Inter');
    expect(html).toContain('Source+Serif');
  });
});
