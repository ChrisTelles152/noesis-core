/**
 * Noesis Core SDK
 *
 * A portable, dependency-free learning engine for mastery-based education.
 *
 * This SDK provides:
 * - Skill graph representation with DAG validation
 * - Bayesian Knowledge Tracing (BKT) learner modeling
 * - FSRS-style memory scheduling
 * - Diagnostic assessment for cold-start placement
 * - Near/far transfer testing with gating
 * - Deterministic session planning
 * - Event replay for reproducibility
 *
 * @packageDocumentation
 */

// Export all types from constitution
export * from './constitution.js';

// Export from domain modules
export * from './events/index.js';
export * from './graph/index.js';
export * from './learner/index.js';
export * from './memory/index.js';
export * from './planning/index.js';
export * from './transfer/index.js';
export * from './diagnostic/index.js';
export * from './engine/index.js';

// Version
export const VERSION = '0.1.0';
