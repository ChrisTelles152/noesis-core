/**
 * NOESIS CORE SDK CONSTITUTION
 * ============================
 *
 * This file defines the canonical interfaces and contracts for the Noesis Core SDK.
 * The Core SDK is a portable, dependency-free learning engine focused on mastery-based learning.
 *
 * NON-NEGOTIABLE PRINCIPLES:
 * 1. NO external dependencies (no React, Express, DB, browser APIs, LLM providers)
 * 2. Pure TypeScript/JavaScript - runs in any environment
 * 3. Deterministic and replayable - all decisions can be reconstructed from events
 * 4. Inspectable - all internal state can be examined and logged
 *
 * THE IRREDUCIBLE LEARNING LOOP (must be supported):
 * 1. Explicit skill graph (DAG) with prerequisites and dependencies
 * 2. Diagnostic-first entry - assess learner's starting state
 * 3. Target smallest leverage gap - find highest-impact skill to learn next
 * 4. Error-focused training - prioritize practice on errors, not successes
 * 5. Mandatory spaced retrieval - enforce retrieval practice at optimal intervals
 * 6. Near/far transfer tests with gating - verify skill transfer before progression
 * 7. Update learner model - adjust probability estimates based on evidence
 * 8. Repeat
 *
 * WHAT CORE IS:
 * - Skill graph representation + validation + prerequisite logic
 * - Diagnostic engine + item-to-skill mapping + cold start learner state
 * - Mastery estimation (inspectable KT/BKT-class models)
 * - Memory scheduler (FSRS-style or equivalent)
 * - Session planner with deterministic policy
 * - Transfer gating (near/far transfer test specification)
 * - Canonical event schema and event emission
 * - Determinism + replay: reproduce decisions from event log + config
 *
 * WHAT CORE IS NOT:
 * - Auth/accounts/sessions (→ apps/server)
 * - Express routes (→ apps/server)
 * - DB/ORM (→ apps/server)
 * - UI/React (→ apps/web-demo)
 * - LLM integration (→ packages/adapters-llm)
 * - Attention tracking (→ packages/adapters-attention-web)
 * - Any browser/DOM APIs (→ adapters)
 */
export {};
// =============================================================================
// TODO: IMPLEMENTATION NOTES
// =============================================================================
/**
 * IMPLEMENTATION PRIORITIES (in order):
 *
 * 1. SkillGraph - Implement DAG with cycle detection, topological sort
 * 2. LearnerModelEngine - Implement BKT-style model with inspectable parameters
 * 3. MemoryScheduler - Implement FSRS algorithm
 * 4. SessionPlanner - Implement deterministic next-item selection
 * 5. TransferGate - Implement gating logic
 * 6. DiagnosticEngine - Implement adaptive diagnostic
 * 7. NoesisCoreEngine - Wire everything together
 *
 * Each component should:
 * - Have comprehensive unit tests
 * - Be pure functions where possible
 * - Log all decisions for replay
 * - Have no external dependencies
 */
//# sourceMappingURL=constitution.js.map