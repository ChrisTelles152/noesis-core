/**
 * Core Engine Adapter
 *
 * Bridges @noesis-edu/core with sdk-web, providing:
 * - Access to the core learning engine
 * - Event emission using canonical core event types
 * - Event log for analysis/replay
 * - Clock injection for sdk-web (uses Date.now() here, not in core)
 */

import {
  createNoesisCoreEngine,
  createSkillGraph,
  createEventFactoryContext,
  createPracticeEvent,
  createDiagnosticEvent,
  createSessionStartEvent,
  createSessionEndEvent,
  type NoesisCoreEngineImpl,
  type SkillGraph,
  type Skill,
  type SessionConfig,
  type SessionAction,
  type NoesisEvent,
  type PracticeEvent,
  type DiagnosticEvent,
  type SessionEvent,
  type ClockFn,
  type IdGeneratorFn,
  type EventFactoryContext,
} from '@noesis-edu/core';

/**
 * Configuration for the core engine adapter
 */
export interface CoreAdapterConfig {
  /** Learning ID for this learner */
  learnerId: string;
  /** Debug mode */
  debug?: boolean;
  /** Custom clock function (defaults to Date.now) */
  clock?: ClockFn;
  /** Custom ID generator (defaults to UUID-like) */
  idGenerator?: IdGeneratorFn;
  /** Initial skill definitions */
  skills?: Skill[];
  /** Session configuration */
  sessionConfig?: Partial<SessionConfig>;
}

/**
 * Default session configuration for sdk-web
 */
const DEFAULT_SDK_SESSION_CONFIG: SessionConfig = {
  maxDurationMinutes: 30,
  targetItems: 20,
  masteryThreshold: 0.85,
  enforceSpacedRetrieval: true,
  requireTransferTests: false, // Relaxed for web apps
};

/**
 * Generate a simple UUID-like ID
 */
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Core Engine Adapter for sdk-web
 */
export class CoreEngineAdapter {
  private engine: NoesisCoreEngineImpl;
  private graph: SkillGraph;
  private eventContext: EventFactoryContext;
  private eventLog: NoesisEvent[] = [];
  private sessionId: string;
  private learnerId: string;
  private sessionConfig: SessionConfig;
  private debug: boolean;
  private clock: ClockFn;

  constructor(config: CoreAdapterConfig) {
    this.debug = config.debug ?? false;
    this.learnerId = config.learnerId;
    this.clock = config.clock ?? (() => Date.now());
    this.sessionId = generateId();

    // Initialize skill graph
    this.graph = createSkillGraph(config.skills ?? []);

    // Create event factory context with injected clock
    const idGenerator = config.idGenerator ?? generateId;
    this.eventContext = createEventFactoryContext(this.clock, idGenerator);

    // Create core engine
    this.engine = createNoesisCoreEngine(this.graph, {}, this.clock);

    // Session config
    this.sessionConfig = {
      ...DEFAULT_SDK_SESSION_CONFIG,
      ...config.sessionConfig,
    };

    this.log('CoreEngineAdapter initialized');
  }

  /**
   * Start a learning session
   */
  startSession(): SessionEvent {
    this.sessionId = generateId();
    const event = createSessionStartEvent(
      this.eventContext,
      this.learnerId,
      this.sessionId,
      this.sessionConfig
    );
    this.pushEvent(event);
    this.engine.processEvent(event);
    return event;
  }

  /**
   * End the current learning session
   */
  endSession(summary: {
    durationMinutes: number;
    itemsAttempted: number;
    itemsCorrect: number;
    skillsPracticed: string[];
  }): SessionEvent {
    const event = createSessionEndEvent(
      this.eventContext,
      this.learnerId,
      this.sessionId,
      summary
    );
    this.pushEvent(event);
    this.engine.processEvent(event);
    return event;
  }

  /**
   * Record a practice event
   */
  recordPractice(
    skillId: string,
    itemId: string,
    correct: boolean,
    responseTimeMs: number,
    options?: { confidence?: number; errorCategory?: string }
  ): PracticeEvent {
    const event = createPracticeEvent(
      this.eventContext,
      this.learnerId,
      this.sessionId,
      skillId,
      itemId,
      correct,
      responseTimeMs,
      options
    );
    this.pushEvent(event);
    this.engine.processEvent(event);
    return event;
  }

  /**
   * Record a diagnostic event
   */
  recordDiagnostic(
    skillsAssessed: string[],
    results: Array<{
      skillId: string;
      score: number;
      itemsAttempted: number;
      itemsCorrect: number;
    }>
  ): DiagnosticEvent {
    const event = createDiagnosticEvent(
      this.eventContext,
      this.learnerId,
      this.sessionId,
      skillsAssessed,
      results
    );
    this.pushEvent(event);
    this.engine.processEvent(event);
    return event;
  }

  /**
   * Get the next recommended action from the session planner
   */
  getNextAction(): SessionAction {
    return this.engine.getNextAction(this.learnerId, this.sessionConfig);
  }

  /**
   * Plan a complete session
   */
  planSession(): SessionAction[] {
    return this.engine.planSession(this.learnerId, this.sessionConfig);
  }

  /**
   * Get the learner's progress summary
   */
  getLearnerProgress() {
    return this.engine.getLearnerProgress(this.learnerId);
  }

  /**
   * Get mastery probability for a skill
   */
  getSkillMastery(skillId: string): number {
    const model = this.engine.getLearnerModel(this.learnerId);
    if (!model) return 0;
    const prob = model.skillProbabilities.get(skillId);
    return prob?.pMastery ?? 0;
  }

  /**
   * Get all unmastered skills
   */
  getUnmasteredSkills(threshold: number = 0.85): string[] {
    const model = this.engine.getLearnerModel(this.learnerId);
    if (!model) return [];

    const unmastered: string[] = [];
    for (const [skillId, prob] of model.skillProbabilities) {
      if (prob.pMastery < threshold) {
        unmastered.push(skillId);
      }
    }
    return unmastered;
  }

  /**
   * Get the complete event log
   */
  getEventLog(): NoesisEvent[] {
    return [...this.eventLog];
  }

  /**
   * Export event log as JSON
   */
  exportEventLog(): string {
    return JSON.stringify(this.eventLog, null, 2);
  }

  /**
   * Clear the event log
   */
  clearEventLog(): void {
    this.eventLog = [];
  }

  /**
   * Get the underlying core engine (for advanced use)
   */
  getCoreEngine(): NoesisCoreEngineImpl {
    return this.engine;
  }

  /**
   * Get the skill graph
   */
  getSkillGraph(): SkillGraph {
    return this.graph;
  }

  /**
   * Update the skill graph
   */
  updateSkillGraph(skills: Skill[]): void {
    this.graph = createSkillGraph(skills);
    // Re-create engine with new graph
    this.engine = createNoesisCoreEngine(this.graph, {}, this.clock);
    this.log('Skill graph updated');
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Push event to log
   */
  private pushEvent(event: NoesisEvent): void {
    this.eventLog.push(event);
    this.log('Event recorded:', event.type, event.id);
  }

  /**
   * Log message if debug enabled
   */
  private log(message: string, ...args: unknown[]): void {
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.log(`[CoreEngineAdapter] ${message}`, ...args);
    }
  }
}

/**
 * Factory function
 */
export function createCoreEngineAdapter(config: CoreAdapterConfig): CoreEngineAdapter {
  return new CoreEngineAdapter(config);
}
