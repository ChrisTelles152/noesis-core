/**
 * Noesis Core SDK
 *
 * A portable, dependency-free learning engine for mastery-based education.
 *
 * @packageDocumentation
 */

// Export all types from constitution
export * from './constitution';

// Export from domain modules (types only for now)
export * from './events';
export * from './graph';
export * from './learner';
export * from './memory';
export * from './planning';
export * from './transfer';

// Version
export const VERSION = '0.1.0';

// TODO: Export implementation when ready
// export { createNoesisCoreEngine } from './engine';
