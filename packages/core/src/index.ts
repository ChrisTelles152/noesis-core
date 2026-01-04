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
export * from './constitution';

// Export from domain modules
export * from './events';
export * from './graph';
export * from './learner';
export * from './memory';
export * from './planning';
export * from './transfer';
export * from './diagnostic';
export * from './engine';

// Version
export const VERSION = '0.1.0';
