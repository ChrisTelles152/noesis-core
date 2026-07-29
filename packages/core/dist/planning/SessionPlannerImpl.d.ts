/**
 * Session Planner Implementation
 *
 * Implements deterministic session planning with the following priority order:
 *
 * 1. Due spaced retrieval items (from MemoryScheduler)
 * 2. Transfer tests for skills at mastery threshold
 * 3. Error-focused practice on recently failed skills
 * 4. New skill introduction (smallest leverage gap - highest impact unlearned skill)
 * 5. Consolidation practice on partially learned skills
 *
 * The planner targets the "zone of proximal development" - skills that are
 * challenging but achievable based on prerequisite mastery.
 *
 * DETERMINISM: All operations are pure and produce the same output
 * for the same input. No randomness, sorted output.
 */
import type { LearnerModel, SkillGraph, MemoryState, SessionConfig, SessionAction, SessionPlanner, TransferTest, TransferTestResult } from '../constitution.js';
/**
 * Extended session configuration with additional planner options
 */
export interface SessionPlannerConfig extends SessionConfig {
    /** Weight for overdue items in priority calculation */
    overdueWeight: number;
    /** Weight for error focus in priority calculation */
    errorWeight: number;
    /** Minimum mastery to consider for transfer testing */
    transferTestThreshold: number;
    /** Maximum items in error focus queue */
    maxErrorFocusItems: number;
}
/**
 * Default session planner configuration
 */
export declare const DEFAULT_SESSION_PLANNER_CONFIG: SessionPlannerConfig;
/**
 * Planner state tracking for a session
 */
export interface PlannerState {
    /** Skills that had errors recently */
    errorFocusSkills: string[];
    /** Skills ready for transfer testing */
    transferReadySkills: string[];
    /** Items already practiced this session */
    practicedItems: Set<string>;
    /** Actions already planned */
    plannedActions: SessionAction[];
}
/**
 * Session Planner Implementation
 */
export declare class SessionPlannerImpl implements SessionPlanner {
    private readonly config;
    private readonly transferTests;
    private readonly transferResults;
    constructor(config?: Partial<SessionPlannerConfig>, transferTests?: TransferTest[], transferResults?: TransferTestResult[]);
    /**
     * Get the next recommended action
     */
    getNextAction(learnerModel: LearnerModel, skillGraph: SkillGraph, memoryStates: MemoryState[], config: SessionConfig): SessionAction;
    /**
     * Plan a complete session
     */
    planSession(learnerModel: LearnerModel, skillGraph: SkillGraph, memoryStates: MemoryState[], config: SessionConfig): SessionAction[];
    /**
     * Get due memory states, sorted by overdue amount
     */
    private getDueStates;
    /**
     * Calculate priority for an overdue item
     */
    private calculateOverduePriority;
    /**
     * Get transfer test action if any skill is ready
     */
    private getTransferTestAction;
    /**
     * Get error-focused practice action
     */
    private getErrorFocusAction;
    /**
     * Get action to introduce a new skill (smallest leverage gap)
     *
     * Finds the skill that:
     * 1. Has all prerequisites mastered
     * 2. Is not yet mastered
     * 3. Has the highest "leverage" (most skills depend on it)
     */
    private getNewSkillAction;
    /**
     * Get consolidation practice action for partially learned skills
     */
    private getConsolidationAction;
    /**
     * Get next action excluding certain skills
     */
    private getNextActionExcluding;
    /**
     * Get session statistics
     */
    getSessionStats(actions: SessionAction[]): SessionStats;
}
/**
 * Session statistics
 */
export interface SessionStats {
    totalActions: number;
    actionsByType: {
        practice: number;
        review: number;
        diagnostic: number;
        transfer_test: number;
        rest: number;
    };
    uniqueSkills: number;
    averagePriority: number;
}
/**
 * Factory function to create a SessionPlanner
 */
export declare function createSessionPlanner(config?: Partial<SessionPlannerConfig>, transferTests?: TransferTest[], transferResults?: TransferTestResult[]): SessionPlannerImpl;
//# sourceMappingURL=SessionPlannerImpl.d.ts.map