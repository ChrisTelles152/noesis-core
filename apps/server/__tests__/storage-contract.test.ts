/**
 * Storage contract regression tests (Phase J3)
 *
 * Pin two facts so a future refactor can't accidentally re-introduce the
 * orphan `linkGoogleAccount` method without going through code review:
 *
 *   1. The IStorage interface does NOT declare it.
 *   2. SqliteStorage does NOT implement it.
 *
 * Background: linkGoogleAccount existed only on SqliteStorage, was never
 * called from anywhere in the codebase, was never added to IStorage, and
 * had no UI affordance. It was deleted in this phase. If "link existing
 * account to Google OAuth" is ever a real product feature, the
 * implementation should re-land deliberately — through IStorage, with a
 * UI, and with route wiring — not as a stranded method on one backend.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const repoRoot = resolve(__dirname, '..', '..', '..');

function readSource(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), 'utf-8');
}

describe('Phase J3: linkGoogleAccount stays deleted', () => {
  it('IStorage does not declare linkGoogleAccount', () => {
    const source = readSource('apps/server/storage.ts');
    expect(source).not.toMatch(/linkGoogleAccount/);
  });

  it('SqliteStorage does not implement linkGoogleAccount', () => {
    const source = readSource('apps/server/sqlite-storage.ts');
    expect(source).not.toMatch(/linkGoogleAccount/);
  });

  it('docs/DATA_MODEL_AUDIT.md does not reference linkGoogleAccount', () => {
    const source = readSource('docs/DATA_MODEL_AUDIT.md');
    expect(source).not.toMatch(/linkGoogleAccount/);
  });
});
