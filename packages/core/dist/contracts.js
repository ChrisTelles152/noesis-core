/**
 * @noesis-edu/core/contracts — types-only subpath
 *
 * Re-exports every type contract pack manifests and integration shims need,
 * with no runtime values (no functions, no classes, no constants).
 *
 * Why this exists: pack manifest packages (`@noesis-content/math-br`,
 * `@noesis-content/eng`, `@noesis-content/delf-fr`) need to declare
 * `EngineConfigOverrides`, `PackManifest`, `ChannelId`, etc. without pulling
 * the full `@noesis-edu/core` runtime into their bundles. Importing from
 * this subpath lets bundlers tree-shake the runtime away entirely — the
 * contracts.js file is essentially empty, since TypeScript erases all
 * type-only exports at compile time.
 *
 * Usage:
 *   import type { ChannelId, EngineConfigOverrides } from '@noesis-edu/core/contracts';
 *
 * Stable: any addition or removal here is a semver-breaking change.
 */
export {};
//# sourceMappingURL=contracts.js.map