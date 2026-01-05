# @noesis/core Publish Readiness Checklist

**Version:** 0.1.0
**Last Verified:** January 2026

This document provides the exact commands to verify @noesis/core is ready for publishing.

---

## Node.js Compatibility

**Supported:** Node.js 18+ (LTS) and Node.js 22+

@noesis/core uses ESM with explicit `.js` extensions in all import specifiers, ensuring native Node.js ESM compatibility without bundlers or loaders.

```bash
# Verify runtime import works
node -e "import('@noesis/core').then(m=>console.log('ok', Object.keys(m).slice(0,5)))"
```

---

## Fresh Clone Setup

After cloning the repository:

```bash
# 1. Install dependencies (from repo root)
npm install

# 2. Build core package
npm run build:core

# 3. Run core tests
npm run test:core

# 4. Run smoke test
npm run smoke:core
```

---

## Expected Outputs

### Build Output

```
> npm run build:core

> @noesis/core@0.1.0 build
> tsc
```

No errors. Output in `packages/core/dist/`.

### Test Output

```
> npm run test:core

 ✓ packages/core/src/__tests__/core.test.ts (47 tests)

 Test Files  1 passed (1)
      Tests  47 passed (47)
```

### Smoke Test Output

```
> npm run smoke:core

🔬 Running @noesis/core smoke test (v0.1.0)

  ✓ Create a skill graph with 3 skills
  ✓ Create engine and learner model
  ✓ Process practice events and update model
  ✓ Get next action from session planner
  ✓ Deterministic replay produces identical results
  ✓ Export and import state for persistence

✅ All smoke tests passed! (6/6)
```

---

## Package Contents Verification

To verify the published package contains only intended files:

```bash
cd packages/core
npm pack --dry-run
```

### Expected Files

```
npm notice Tarball Contents
npm notice  LICENSE
npm notice  README.md
npm notice  package.json
npm notice  dist/constitution.js
npm notice  dist/constitution.d.ts
npm notice  dist/diagnostic/...
npm notice  dist/engine/...
npm notice  dist/events/...
npm notice  dist/graph/...
npm notice  dist/index.js
npm notice  dist/index.d.ts
npm notice  dist/learner/...
npm notice  dist/memory/...
npm notice  dist/planning/...
npm notice  dist/transfer/...

npm notice total files: 71
npm notice package size: ~49 kB
```

### NOT Expected

- ❌ No `src/` directory
- ❌ No `__tests__` directory
- ❌ No `*.test.ts` files
- ❌ No `scripts/` directory

---

## Verification Checklist

Run each check before publishing:

| Check | Command | Expected |
|-------|---------|----------|
| Build succeeds | `npm run build:core` | No errors |
| 47 tests pass | `npm run test:core` | All green |
| Smoke test passes | `npm run smoke:core` | 6/6 passed |
| No runtime deps | Check package.json | Only `devDependencies` |
| Package contents clean | `npm pack --dry-run` | 71 files, no tests |
| Types exported | Import in TypeScript | No errors |

---

## Troubleshooting

### "Cannot find module" errors in smoke test

The smoke test uses `tsx` to run TypeScript directly. Ensure:
1. You're running from the repo root: `npm run smoke:core`
2. Dependencies are installed: `npm install`
3. Core is built first: `npm run build:core`

### Tests fail with "unexpected token"

Make sure you're using Node.js 18+:
```bash
node --version  # Should be v18.x or higher
```

### Package size unexpectedly large

Check for leaked test files:
```bash
cd packages/core
npm pack --dry-run | grep -E "test|__tests__"
```

If test files appear, verify `tsconfig.json` excludes them and run:
```bash
rm -rf dist && npm run build
```

### Import errors after publishing

Verify the exports map in `package.json`:
```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  }
}
```

---

## Release Commands

Once all checks pass:

```bash
# From packages/core directory
cd packages/core

# Verify version
cat package.json | grep version

# Publish (requires npm auth)
npm publish --access public
```

---

## Post-Publish Verification

After publishing, verify the package works in a clean project:

```bash
# Create temp directory
mkdir /tmp/test-noesis-core && cd /tmp/test-noesis-core
npm init -y

# Install published package
npm install @noesis/core

# Test import
echo "import { createSkillGraph, VERSION } from '@noesis/core'; console.log('v' + VERSION);" > test.mjs
node test.mjs  # Should print: v0.1.0
```

---

*This checklist ensures @noesis/core is publish-ready with all quality guarantees.*
