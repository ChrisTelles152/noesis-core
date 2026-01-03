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

// =============================================================================
// SKILL GRAPH TYPES
// =============================================================================

/**
 * A skill in the knowledge graph
 */
export interface Skill {
  /** Unique identifier for this skill */
  id: string;
  /** Human-readable name */
  name: string;
  /** Optional description */
  description?: string;
  /** IDs of prerequisite skills (must be mastered before this skill) */
  prerequisites: string[];
  /** Skill category/type for grouping */
  category?: string;
  /** Estimated difficulty (0-1) */
  difficulty?: number;
}

/**
 * A directed acyclic graph of skills
 */
export interface SkillGraph {
  /** All skills in the graph */
  skills: Map<string, Skill>;
  /** Validate graph integrity (no cycles, valid prerequisites) */
  validate(): SkillGraphValidationResult;
  /** Get skills in topological order */
  getTopologicalOrder(): string[];
  /** Get all prerequisites (transitive) for a skill */
  getAllPrerequisites(skillId: string): string[];
  /** Get skills that depend on this skill */
  getDependents(skillId: string): string[];
  /** Check if skill A is a prerequisite of skill B */
  isPrerequisiteOf(skillA: string, skillB: string): boolean;
}

export interface SkillGraphValidationResult {
  valid: boolean;
  errors: SkillGraphError[];
}

export interface SkillGraphError {
  type: 'CYCLE_DETECTED' | 'MISSING_PREREQUISITE' | 'DUPLICATE_SKILL';
  message: string;
  affectedSkills: string[];
}

// =============================================================================
// LEARNER MODEL TYPES
// =============================================================================

/**
 * Probability estimate for a single skill
 */
export interface SkillProbability {
  /** Skill ID */
  skillId: string;
  /** Probability of mastery (0-1) */
  pMastery: number;
  /** Probability of slip (known but answer incorrectly) */
  pSlip: number;
  /** Probability of guess (unknown but answer correctly) */
  pGuess: number;
  /** Probability of learning (transition from unknown to known) */
  pLearn: number;
  /** Last update timestamp */
  lastUpdated: number;
}

/**
 * Complete learner state at a point in time
 */
export interface LearnerModel {
  /** Learner identifier */
  learnerId: string;
  /** Skill probability estimates */
  skillProbabilities: Map<string, SkillProbability>;
  /** Total practice events recorded */
  totalEvents: number;
  /** Model creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  lastUpdated: number;
}

/**
 * Interface for learner model operations
 */
export interface LearnerModelEngine {
  /** Create a new learner model with cold start priors */
  createModel(learnerId: string, skillGraph: SkillGraph): LearnerModel;
  /** Update model based on a practice event */
  updateModel(model: LearnerModel, event: PracticeEvent): LearnerModel;
  /** Get probability of mastery for a skill */
  getPMastery(model: LearnerModel, skillId: string): number;
  /** Identify skills below mastery threshold */
  getUnmasteredSkills(model: LearnerModel, threshold: number): string[];
  /** Serialize model for storage */
  serialize(model: LearnerModel): string;
  /** Deserialize model from storage */
  deserialize(data: string): LearnerModel;
}

// =============================================================================
// MEMORY SCHEDULER TYPES
// =============================================================================

/**
 * Memory state for a single skill (FSRS-style)
 */
export interface MemoryState {
  /** Skill ID */
  skillId: string;
  /** Stability (days until 90% retention) */
  stability: number;
  /** Difficulty (0-1, higher = harder to remember) */
  difficulty: number;
  /** Last review timestamp */
  lastReview: number;
  /** Next scheduled review timestamp */
  nextReview: number;
  /** Number of successful recalls */
  successCount: number;
  /** Number of failed recalls */
  failureCount: number;
  /** Current state: new, learning, review, relearning */
  state: 'new' | 'learning' | 'review' | 'relearning';
}

/**
 * Interface for memory scheduling operations
 */
export interface MemoryScheduler {
  /** Create initial memory state for a skill */
  createState(skillId: string): MemoryState;
  /** Schedule next review based on recall result */
  scheduleReview(state: MemoryState, recalled: boolean, rating: 1 | 2 | 3 | 4): MemoryState;
  /** Get skills due for review at a given time */
  getDueSkills(states: MemoryState[], atTime: number): MemoryState[];
  /** Calculate retention probability at a given time */
  getRetention(state: MemoryState, atTime: number): number;
}

// =============================================================================
// SESSION PLANNER TYPES
// =============================================================================

/**
 * A recommended next action in a learning session
 */
export interface SessionAction {
  /** Type of action */
  type: 'practice' | 'review' | 'diagnostic' | 'transfer_test' | 'rest';
  /** Target skill ID (if applicable) */
  skillId?: string;
  /** Specific item/question ID (if applicable) */
  itemId?: string;
  /** Reason for this recommendation */
  reason: string;
  /** Priority score (higher = more urgent) */
  priority: number;
}

/**
 * Session planning configuration
 */
export interface SessionConfig {
  /** Maximum session duration in minutes */
  maxDurationMinutes: number;
  /** Target number of items per session */
  targetItems: number;
  /** Mastery threshold (0-1) */
  masteryThreshold: number;
  /** Whether to enforce spaced retrieval */
  enforceSpacedRetrieval: boolean;
  /** Whether to require transfer tests before progression */
  requireTransferTests: boolean;
}

/**
 * Interface for session planning
 */
export interface SessionPlanner {
  /** Get the next recommended action */
  getNextAction(
    learnerModel: LearnerModel,
    skillGraph: SkillGraph,
    memoryStates: MemoryState[],
    config: SessionConfig
  ): SessionAction;
  /** Plan a complete session */
  planSession(
    learnerModel: LearnerModel,
    skillGraph: SkillGraph,
    memoryStates: MemoryState[],
    config: SessionConfig
  ): SessionAction[];
}

// =============================================================================
// TRANSFER TESTING TYPES
// =============================================================================

/**
 * A transfer test specification
 */
export interface TransferTest {
  /** Test ID */
  id: string;
  /** Skill being tested */
  skillId: string;
  /** Type of transfer */
  transferType: 'near' | 'far';
  /** Description of the test context */
  context: string;
  /** Required passing score (0-1) */
  passingScore: number;
}

/**
 * Result of a transfer test
 */
export interface TransferTestResult {
  /** Test ID */
  testId: string;
  /** Whether the test was passed */
  passed: boolean;
  /** Actual score achieved */
  score: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Interface for transfer gating
 */
export interface TransferGate {
  /** Check if a skill has passed required transfer tests */
  isSkillUnlocked(
    skillId: string,
    testResults: TransferTestResult[],
    tests: TransferTest[]
  ): boolean;
  /** Get required tests for a skill */
  getRequiredTests(skillId: string, tests: TransferTest[]): TransferTest[];
  /** Get pending (not yet passed) tests for a skill */
  getPendingTests(
    skillId: string,
    testResults: TransferTestResult[],
    tests: TransferTest[]
  ): TransferTest[];
}

// =============================================================================
// EVENT TYPES (Canonical Schema)
// =============================================================================

/**
 * Base event type - all events extend this
 */
export interface BaseEvent {
  /** Event ID (UUID) */
  id: string;
  /** Event type discriminator */
  type: string;
  /** Learner ID */
  learnerId: string;
  /** Timestamp (milliseconds since epoch) */
  timestamp: number;
  /** Session ID for grouping events */
  sessionId: string;
}

/**
 * Practice event - learner attempts an item
 */
export interface PracticeEvent extends BaseEvent {
  type: 'practice';
  /** Skill being practiced */
  skillId: string;
  /** Item/question ID */
  itemId: string;
  /** Whether the response was correct */
  correct: boolean;
  /** Response time in milliseconds */
  responseTimeMs: number;
  /** Confidence rating (if provided) */
  confidence?: number;
  /** Error category (if incorrect) */
  errorCategory?: string;
}

/**
 * Diagnostic event - initial assessment
 */
export interface DiagnosticEvent extends BaseEvent {
  type: 'diagnostic';
  /** Skills assessed */
  skillsAssessed: string[];
  /** Results per skill */
  results: Array<{
    skillId: string;
    score: number;
    itemsAttempted: number;
    itemsCorrect: number;
  }>;
}

/**
 * Transfer test event
 */
export interface TransferTestEvent extends BaseEvent {
  type: 'transfer_test';
  /** Test ID */
  testId: string;
  /** Skill tested */
  skillId: string;
  /** Transfer type */
  transferType: 'near' | 'far';
  /** Score achieved */
  score: number;
  /** Whether passed */
  passed: boolean;
}

/**
 * Session event - session start/end
 */
export interface SessionEvent extends BaseEvent {
  type: 'session_start' | 'session_end';
  /** Session configuration (for start) */
  config?: SessionConfig;
  /** Session summary (for end) */
  summary?: {
    durationMinutes: number;
    itemsAttempted: number;
    itemsCorrect: number;
    skillsPracticed: string[];
  };
}

/**
 * Union type of all events
 */
export type NoesisEvent = PracticeEvent | DiagnosticEvent | TransferTestEvent | SessionEvent;

// =============================================================================
// DIAGNOSTIC ENGINE TYPES
// =============================================================================

/**
 * Item-to-skill mapping
 */
export interface ItemSkillMapping {
  /** Item ID */
  itemId: string;
  /** Primary skill tested */
  primarySkillId: string;
  /** Secondary skills involved */
  secondarySkillIds: string[];
  /** Item difficulty (0-1) */
  difficulty: number;
}

/**
 * Interface for diagnostic assessment
 */
export interface DiagnosticEngine {
  /** Generate a diagnostic test for a skill graph */
  generateDiagnostic(
    skillGraph: SkillGraph,
    itemMappings: ItemSkillMapping[],
    maxItems: number
  ): string[];
  /** Analyze diagnostic results to initialize learner model */
  analyzeResults(
    skillGraph: SkillGraph,
    itemMappings: ItemSkillMapping[],
    responses: Array<{ itemId: string; correct: boolean }>
  ): Map<string, number>;
}

// =============================================================================
// CORE ENGINE INTERFACE
// =============================================================================

/**
 * The main Noesis Core Engine interface
 * This is the primary entry point for the core SDK
 */
export interface NoesisCoreEngine {
  /** Skill graph operations */
  readonly graph: SkillGraph;
  /** Learner model operations */
  readonly learnerEngine: LearnerModelEngine;
  /** Memory scheduling operations */
  readonly memoryScheduler: MemoryScheduler;
  /** Session planning operations */
  readonly sessionPlanner: SessionPlanner;
  /** Transfer gating operations */
  readonly transferGate: TransferGate;
  /** Diagnostic operations */
  readonly diagnosticEngine: DiagnosticEngine;

  /** Process an event and update all internal state */
  processEvent(event: NoesisEvent): void;
  /** Get the current learner model */
  getLearnerModel(learnerId: string): LearnerModel | undefined;
  /** Get memory states for a learner */
  getMemoryStates(learnerId: string): MemoryState[];
  /** Get next recommended action */
  getNextAction(learnerId: string, config: SessionConfig): SessionAction;
  /** Export all state for persistence */
  exportState(): string;
  /** Import state from persistence */
  importState(data: string): void;
}

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
