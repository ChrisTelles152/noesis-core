/**
 * Version-sync test (Phase I2)
 *
 * The exported VERSION constant must equal the package.json version.
 * Catches the "bumped one but forgot the other" mistake before a tag
 * pushes a release where the published artifact reports the wrong
 * version through `import { VERSION }`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { VERSION } from '../index.js';

describe('VERSION constant', () => {
  it('matches packages/core/package.json version', () => {
    const pkgPath = resolve(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });

  it('is currently 0.3.0-rc.0', () => {
    // Pinned so a release script that only updates one of the two
    // sources fails this test loudly. Bump in lockstep.
    expect(VERSION).toBe('0.3.0-rc.0');
  });
});
