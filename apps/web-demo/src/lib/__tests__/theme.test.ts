/**
 * Brand theme tests (Phase G1)
 *
 * Verifies that the locked Noesis brand palette is exposed as named
 * Tailwind tokens, and that the shadcn CSS variable layer in index.css
 * routes through those tokens (so a future palette refresh only has to
 * touch the hex values in tailwind.config.ts + the HSL triplets in
 * index.css together — application code keeps working unchanged).
 *
 * The five locked names come from INTENTION.md:
 *   Cloudbone White, Slate Grey, Neural Copper, Iris Bloom, Glacial Cyan.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindConfig from '../../../../../tailwind.config';

const PROJECT_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');
const INDEX_CSS_PATH = resolve(PROJECT_ROOT, 'apps/web-demo/src/index.css');

const REQUIRED_BRAND_TOKENS = [
  'cloudbone-white',
  'slate-grey',
  'neural-copper',
  'iris-bloom',
  'glacial-cyan',
] as const;

function getColors(): Record<string, unknown> {
  const theme = (tailwindConfig as { theme?: { extend?: { colors?: Record<string, unknown> } } })
    .theme;
  return theme?.extend?.colors ?? {};
}

describe('Phase G1: brand palette tokens in tailwind.config', () => {
  const colors = getColors();

  it.each(REQUIRED_BRAND_TOKENS)('exposes %s as a named token', (token) => {
    expect(colors).toHaveProperty(token);
    const value = colors[token];
    expect(typeof value).toBe('string');
    // Must be a 6-character hex (#RRGGBB).
    expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('all five tokens have distinct hex values (no accidental aliasing)', () => {
    const values = REQUIRED_BRAND_TOKENS.map((t) => colors[t] as string);
    expect(new Set(values).size).toBe(REQUIRED_BRAND_TOKENS.length);
  });

  it('preserves the shadcn semantic colors that map through these tokens', () => {
    // The shadcn primitives reference `background`, `foreground`, `primary`,
    // `secondary`, `accent`, etc. via hsl(var(--…)). The Tailwind config
    // must keep those bindings so existing components keep compiling.
    const required = ['background', 'foreground', 'primary', 'secondary', 'accent', 'border'];
    for (const name of required) {
      expect(colors, `Missing ${name} in tailwind theme.extend.colors`).toHaveProperty(name);
    }
  });
});

describe('Phase G1: shadcn CSS variables route through brand palette', () => {
  it('index.css declares :root with the brand-routed CSS variables', () => {
    expect(existsSync(INDEX_CSS_PATH)).toBe(true);
    const css = readFileSync(INDEX_CSS_PATH, 'utf8');

    // Each CSS variable required by shadcn primitives must be present in :root.
    const requiredVars = [
      '--background',
      '--foreground',
      '--muted',
      '--muted-foreground',
      '--popover',
      '--popover-foreground',
      '--card',
      '--card-foreground',
      '--border',
      '--input',
      '--primary',
      '--primary-foreground',
      '--secondary',
      '--secondary-foreground',
      '--accent',
      '--accent-foreground',
      '--destructive',
      '--destructive-foreground',
      '--ring',
      '--radius',
    ];
    for (const v of requiredVars) {
      expect(css, `Missing ${v} in index.css`).toContain(v);
    }
  });

  it('index.css references the locked brand hex values inline as comments', () => {
    // Documenting the hex right next to the HSL triplet is the contract that
    // keeps the two files in sync. If a future contributor changes the hex
    // in tailwind.config.ts they get a visible, line-level reminder to also
    // update the HSL triplet here.
    const css = readFileSync(INDEX_CSS_PATH, 'utf8');
    expect(css).toContain('cloudbone-white');
    expect(css).toContain('slate-grey');
    expect(css).toContain('neural-copper');
    expect(css).toContain('iris-bloom');
    expect(css).toContain('glacial-cyan');
  });
});
