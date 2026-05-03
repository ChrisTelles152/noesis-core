/**
 * Docs site scaffold contract test (Phase I3 + I4)
 *
 * The docs/site/ Astro Starlight scaffold sits outside the npm
 * workspaces, so it never gets built by the root test runner. These
 * tests pin the contract surface — the files exist, the workspace
 * aliases line up, the Vercel config points at the right output dir —
 * so a refactor that breaks the expected layout fails CI loudly.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const repoRoot = resolve(__dirname, '..');

function exists(rel: string): boolean {
  return existsSync(resolve(repoRoot, rel));
}

function readJson<T = unknown>(rel: string): T {
  return JSON.parse(readFileSync(resolve(repoRoot, rel), 'utf-8')) as T;
}

function readText(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), 'utf-8');
}

describe('Phase I3: docs/site/ scaffold', () => {
  it('has package.json with astro + starlight as dependencies', () => {
    const pkg = readJson<{ dependencies: Record<string, string>; scripts: Record<string, string> }>(
      'docs/site/package.json',
    );
    expect(pkg.dependencies['astro']).toBeDefined();
    expect(pkg.dependencies['@astrojs/starlight']).toBeDefined();
    expect(pkg.scripts.dev).toBe('astro dev');
    expect(pkg.scripts.build).toBe('astro build');
  });

  it('has astro.config.mjs that references starlight + a brand stylesheet', () => {
    expect(exists('docs/site/astro.config.mjs')).toBe(true);
    const cfg = readText('docs/site/astro.config.mjs');
    expect(cfg).toMatch(/@astrojs\/starlight/);
    expect(cfg).toMatch(/customCss/);
    expect(cfg).toMatch(/brand\.css/);
  });

  it('ships a brand.css that wires Starlight CSS vars to the locked palette', () => {
    expect(exists('docs/site/src/styles/brand.css')).toBe(true);
    const css = readText('docs/site/src/styles/brand.css');
    // Pin the five locked colors — if any of these go missing the docs
    // site has visually drifted from apps/web-demo (Phase G).
    expect(css).toMatch(/#[Ff]4[Ee][Ff][Ee]6/); // Cloudbone White
    expect(css).toMatch(/#475569/); // Slate Grey
    expect(css).toMatch(/#[Bb]87333/); // Neural Copper
    expect(css).toMatch(/#9[Ff]86[Cc]0/); // Iris Bloom
    expect(css).toMatch(/#[Bb]8[Dd][Cc][Dd][Dd]/); // Glacial Cyan
  });

  it('has every doc page the sidebar references', () => {
    const expected = [
      'docs/site/src/content/docs/index.mdx',
      'docs/site/src/content/docs/overview.md',
      'docs/site/src/content/docs/quickstart.md',
      'docs/site/src/content/docs/core/engine.md',
      'docs/site/src/content/docs/core/determinism.md',
      'docs/site/src/content/docs/core/canonical-loop.md',
      'docs/site/src/content/docs/api/reference.md',
      'docs/site/src/content/docs/pilot/content-pack.md',
      'docs/site/src/content/docs/pilot/learner-flow.md',
      'docs/site/src/content/docs/pilot/admin-surfaces.md',
    ];
    for (const path of expected) {
      expect(exists(path), `${path} should exist`).toBe(true);
    }
  });

  it('docs/site sits outside the root npm workspaces', () => {
    // Keeps the (heavy) Astro deps from being installed on every root
    // npm ci. If a future refactor pulls it in, this test makes that
    // explicit and forces a conscious decision.
    const pkg = readJson<{ workspaces: string[] }>('package.json');
    expect(pkg.workspaces).not.toContain('docs/site');
    expect(pkg.workspaces).not.toContain('docs/*');
  });
});

describe('Phase I4: vercel.json', () => {
  it('exists at the repo root', () => {
    expect(exists('vercel.json')).toBe(true);
  });

  it('points the build at docs/site and the output at docs/site/dist', () => {
    const cfg = readJson<{
      buildCommand: string;
      outputDirectory: string;
      framework: string;
    }>('vercel.json');
    expect(cfg.buildCommand).toMatch(/docs\/site/);
    expect(cfg.buildCommand).toMatch(/npm install/);
    expect(cfg.buildCommand).toMatch(/npm run build/);
    expect(cfg.outputDirectory).toBe('docs/site/dist');
    expect(cfg.framework).toBe('astro');
  });
});
