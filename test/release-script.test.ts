/**
 * Release-script wiring tests (Phase I1)
 *
 * Pin the npm-script + workflow contract so a future hand-edit can't
 * silently revert release:core back to an echo placeholder, and so the
 * GitHub release workflow keeps the verify-pack guard.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const repoRoot = resolve(__dirname, '..');

function readJson<T = unknown>(relPath: string): T {
  return JSON.parse(readFileSync(resolve(repoRoot, relPath), 'utf-8')) as T;
}

function readText(relPath: string): string {
  return readFileSync(resolve(repoRoot, relPath), 'utf-8');
}

describe('Phase I1: release:core script', () => {
  it('package.json release:core actually builds + tests + publishes (no echo)', () => {
    const pkg = readJson<{ scripts: Record<string, string> }>('package.json');
    const release = pkg.scripts['release:core'];
    expect(release).toBeDefined();
    expect(release).not.toMatch(/^echo/);
    expect(release).toMatch(/build:core/);
    expect(release).toMatch(/test:core/);
    expect(release).toMatch(/smoke:core/);
    expect(release).toMatch(/npm publish/);
    expect(release).toMatch(/--access public/);
  });

  it('package.json exposes a dry-run release for local sanity checks', () => {
    const pkg = readJson<{ scripts: Record<string, string> }>('package.json');
    const dryRun = pkg.scripts['release:core:dry-run'];
    expect(dryRun).toBeDefined();
    expect(dryRun).toMatch(/--dry-run/);
  });

  it('package.json exposes a verify:core:pack script for CI to call', () => {
    const pkg = readJson<{ scripts: Record<string, string> }>('package.json');
    expect(pkg.scripts['verify:core:pack']).toMatch(/npm pack --dry-run/);
  });
});

describe('Phase I1: release.yml workflow', () => {
  const workflow = readText('.github/workflows/release.yml');

  it('triggers on core-v* tags', () => {
    expect(workflow).toMatch(/tags:\s*\n\s*-\s*['"]core-v\*['"]/);
  });

  it('runs build, test, and smoke before publishing', () => {
    expect(workflow).toMatch(/npm run build:core/);
    expect(workflow).toMatch(/npm run test:core/);
    expect(workflow).toMatch(/npm run smoke:core/);
    // Publish step must come after — defensive: just check it's present.
    expect(workflow).toMatch(/npm publish --access public/);
  });

  it('reads NPM_TOKEN from repository secrets', () => {
    expect(workflow).toMatch(/NODE_AUTH_TOKEN:\s*\$\{\{\s*secrets\.NPM_TOKEN\s*\}\}/);
  });

  it('verifies pack contents before publishing (no leaked test files)', () => {
    expect(workflow).toMatch(/npm pack --dry-run/);
    expect(workflow).toMatch(/Test files leaked/);
  });
});
