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

import type {
  LearnerModel,
  SkillGraph,
  MemoryState,
  SessionConfig,
  SessionAction,
  SessionPlanner,
  TransferTest,
  TransferTestResult,
} from '../constitution';

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
export const DEFAULT_SESSION_PLANNER_CONFIG: SessionPlannerConfig = {
  maxDurationMinutes: 30,
  targetItems: 20,
  masteryThreshold: 0.85,
  enforceSpacedRetrieval: true,
  requireTransferTests: true,
  overdueWeight: 2.0,
  errorWeight: 1.5,
  transferTestThreshold: 0.8,
  maxErrorFocusItems: 5,
};

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
export class SessionPlannerImpl implements SessionPlanner {
  private readonly config: SessionPlannerConfig;
  private readonly transferTests: TransferTest[];
  private readonly transferResults: TransferTestResult[];

  constructor(
    config: Partial<SessionPlannerConfig> = {},
    transferTests: TransferTest[] = [],
    transferResults: TransferTestResult[] = []
  ) {
    this.config = { ...DEFAULT_SESSION_PLANNER_CONFIG, ...config };
    this.transferTests = transferTests;
    this.transferResults = transferResults;
  }

  /**
   * Get the next recommended action
   */
  getNextAction(
    learnerModel: LearnerModel,
    skillGraph: SkillGraph,
    memoryStates: MemoryState[],
    config: SessionConfig
  ): SessionAction {
    const mergedConfig = { ...this.config, ...config };
    const now = learnerModel.lastUpdated;

    // Priority 1: Due spaced retrieval items
    if (mergedConfig.enforceSpacedRetrieval) {
      const dueStates = this.getDueStates(memoryStates, now);
      if (dueStates.length > 0) {
        const mostOverdue = dueStates[0];
        return {
          type: 'review',
          skillId: mostOverdue.skillId,
          reason: 'Spaced retrieval due',
          priority: this.calculateOverduePriority(mostOverdue, now),
        };
      }
    }

    // Priority 2: Transfer tests for skills at mastery
    if (mergedConfig.requireTransferTests) {
      const transferAction = this.getTransferTestAction(learnerModel, skillGraph);
      if (transferAction) {
        return transferAction;
      }
    }

    // Priority 3: Error-focused practice
    const errorAction = this.getErrorFocusAction(learnerModel, skillGraph, memoryStates);
    if (errorAction) {
      return errorAction;
    }

    // Priority 4: New skill introduction (smallest leverage gap)
    const newSkillAction = this.getNewSkillAction(learnerModel, skillGraph);
    if (newSkillAction) {
      return newSkillAction;
    }

    // Priority 5: Consolidation practice
    const consolidationAction = this.getConsolidationAction(learnerModel, skillGraph);
    if (consolidationAction) {
      return consolidationAction;
    }

    // No actions needed - suggest rest
    return {
      type: 'rest',
      reason: 'No immediate learning actions needed',
      priority: 0,
    };
  }

  /**
   * Plan a complete session
   */
  planSession(
    learnerModel: LearnerModel,
    skillGraph: SkillGraph,
    memoryStates: MemoryState[],
    config: SessionConfig
  ): SessionAction[] {
    const mergedConfig = { ...this.config, ...config };
    const actions: SessionAction[] = [];
    const now = learnerModel.lastUpdated;

    // State for tracking what we've already planned
    const plannedSkills = new Set<string>();
    let itemCount = 0;

    while (itemCount < mergedConfig.targetItems) {
      // Get due reviews first
      if (mergedConfig.enforceSpacedRetrieval) {
        const dueStates = this.getDueStates(memoryStates, now)
          .filter(s => !plannedSkills.has(s.skillId));

        for (const state of dueStates) {
          if (itemCount >= mergedConfig.targetItems) break;
          actions.push({
            type: 'review',
            skillId: state.skillId,
            reason: 'Spaced retrieval due',
            priority: this.calculateOverduePriority(state, now),
          });
          plannedSkills.add(state.skillId);
          itemCount++;
        }
      }

      if (itemCount >= mergedConfig.targetItems) break;

      // Get next action excluding already planned skills
      const nextAction = this.getNextActionExcluding(
        learnerModel,
        skillGraph,
        memoryStates,
        config,
        plannedSkills
      );

      if (nextAction.type === 'rest') {
        break; // No more actions available
      }

      actions.push(nextAction);
      if (nextAction.skillId) {
        plannedSkills.add(nextAction.skillId);
      }
      itemCount++;
    }

    // Sort by priority (highest first)
    return actions.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get due memory states, sorted by overdue amount
   */
  private getDueStates(states: MemoryState[], atTime: number): MemoryState[] {
    return states
      .filter(s => s.nextReview <= atTime)
      .sort((a, b) => {
        const overdueA = atTime - a.nextReview;
        const overdueB = atTime - b.nextReview;
        if (overdueA !== overdueB) {
          return overdueB - overdueA;
        }
        return a.skillId.localeCompare(b.skillId);
      });
  }

  /**
   * Calculate priority for an overdue item
   */
  private calculateOverduePriority(state: MemoryState, now: number): number {
    const overdueDays = (now - state.nextReview) / (24 * 60 * 60 * 1000);
    return Math.min(100, 50 + overdueDays * this.config.overdueWeight);
  }

  /**
   * Get transfer test action if any skill is ready
   */
  private getTransferTestAction(
    learnerModel: LearnerModel,
    skillGraph: SkillGraph
  ): SessionAction | undefined {
    const skillOrder = skillGraph.getTopologicalOrder();

    for (const skillId of skillOrder) {
      const pMastery = learnerModel.skillProbabilities.get(skillId)?.pMastery || 0;

      // Check if skill is ready for transfer testing
      if (pMastery >= this.config.transferTestThreshold) {
        // Check if transfer test is needed
        const skillTests = this.transferTests.filter(t => t.skillId === skillId);
        const passedTests = new Set(
          this.transferResults
            .filter(r => r.passed)
            .map(r => r.testId)
        );

        const pendingTests = skillTests.filter(t => !passedTests.has(t.id));

        if (pendingTests.length > 0) {
          // Prioritize near transfer first
          const nearTests = pendingTests.filter(t => t.transferType === 'near');
          const testToTake = nearTests.length > 0 ? nearTests[0] : pendingTests[0];

          return {
            type: 'transfer_test',
            skillId,
            itemId: testToTake.id,
            reason: `${testToTake.transferType} transfer test for mastered skill`,
            priority: 75,
          };
        }
      }
    }

    return undefined;
  }

  /**
   * Get error-focused practice action
   */
  private getErrorFocusAction(
    _learnerModel: LearnerModel,
    _skillGraph: SkillGraph,
    memoryStates: MemoryState[]
  ): SessionAction | undefined {
    // Find skills with recent failures (relearning state in memory)
    const relearningStates = memoryStates
      .filter(s => s.state === 'relearning')
      .sort((a, b) => b.failureCount - a.failureCount || a.skillId.localeCompare(b.skillId));

    if (relearningStates.length > 0) {
      const targetSkill = relearningStates[0];
      return {
        type: 'practice',
        skillId: targetSkill.skillId,
        reason: 'Error-focused practice (recent failures)',
        priority: 60 + targetSkill.failureCount * this.config.errorWeight,
      };
    }

    return undefined;
  }

  /**
   * Get action to introduce a new skill (smallest leverage gap)
   *
   * Finds the skill that:
   * 1. Has all prerequisites mastered
   * 2. Is not yet mastered
   * 3. Has the highest "leverage" (most skills depend on it)
   */
  private getNewSkillAction(
    learnerModel: LearnerModel,
    skillGraph: SkillGraph
  ): SessionAction | undefined {
    const skillOrder = skillGraph.getTopologicalOrder();
    const candidates: Array<{ skillId: string; leverage: number }> = [];

    for (const skillId of skillOrder) {
      const pMastery = learnerModel.skillProbabilities.get(skillId)?.pMastery || 0;

      // Skip already mastered skills
      if (pMastery >= this.config.masteryThreshold) {
        continue;
      }

      // Check if prerequisites are mastered
      const prereqs = skillGraph.getAllPrerequisites(skillId);
      const prereqsMastered = prereqs.every(prereqId => {
        const prereqP = learnerModel.skillProbabilities.get(prereqId)?.pMastery || 0;
        return prereqP >= this.config.masteryThreshold;
      });

      if (!prereqsMastered && prereqs.length > 0) {
        continue;
      }

      // Calculate leverage (number of dependents)
      const dependents = skillGraph.getDependents(skillId);
      const leverage = dependents.length + 1;

      candidates.push({ skillId, leverage });
    }

    if (candidates.length === 0) {
      return undefined;
    }

    // Sort by leverage (highest first), then alphabetically for determinism
    candidates.sort((a, b) => {
      if (a.leverage !== b.leverage) {
        return b.leverage - a.leverage;
      }
      return a.skillId.localeCompare(b.skillId);
    });

    const target = candidates[0];
    return {
      type: 'practice',
      skillId: target.skillId,
      reason: `New skill introduction (leverage: ${target.leverage} dependents)`,
      priority: 40 + target.leverage,
    };
  }

  /**
   * Get consolidation practice action for partially learned skills
   */
  private getConsolidationAction(
    learnerModel: LearnerModel,
    skillGraph: SkillGraph
  ): SessionAction | undefined {
    const skillOrder = skillGraph.getTopologicalOrder();
    const candidates: Array<{ skillId: string; pMastery: number }> = [];

    for (const skillId of skillOrder) {
      const pMastery = learnerModel.skillProbabilities.get(skillId)?.pMastery || 0;

      // Find partially learned skills (between 0.3 and mastery threshold)
      if (pMastery >= 0.3 && pMastery < this.config.masteryThreshold) {
        candidates.push({ skillId, pMastery });
      }
    }

    if (candidates.length === 0) {
      return undefined;
    }

    // Sort by pMastery descending (closest to mastery first)
    candidates.sort((a, b) => {
      if (a.pMastery !== b.pMastery) {
        return b.pMastery - a.pMastery;
      }
      return a.skillId.localeCompare(b.skillId);
    });

    const target = candidates[0];
    return {
      type: 'practice',
      skillId: target.skillId,
      reason: `Consolidation practice (${Math.round(target.pMastery * 100)}% mastery)`,
      priority: 30 + target.pMastery * 10,
    };
  }

  /**
   * Get next action excluding certain skills
   */
  private getNextActionExcluding(
    learnerModel: LearnerModel,
    skillGraph: SkillGraph,
    memoryStates: MemoryState[],
    config: SessionConfig,
    excludeSkills: Set<string>
  ): SessionAction {
    // Filter memory states
    const filteredStates = memoryStates.filter(s => !excludeSkills.has(s.skillId));

    // Create a filtered learner model view
    const filteredModel: LearnerModel = {
      ...learnerModel,
      skillProbabilities: new Map(
        Array.from(learnerModel.skillProbabilities.entries())
          .filter(([id]) => !excludeSkills.has(id))
      ),
    };

    // Get next action with filtered data
    const action = this.getNextAction(filteredModel, skillGraph, filteredStates, config);

    // If action uses an excluded skill, return rest
    if (action.skillId && excludeSkills.has(action.skillId)) {
      return {
        type: 'rest',
        reason: 'No more available actions',
        priority: 0,
      };
    }

    return action;
  }

  /**
   * Get session statistics
   */
  getSessionStats(actions: SessionAction[]): SessionStats {
    const byType = {
      practice: actions.filter(a => a.type === 'practice').length,
      review: actions.filter(a => a.type === 'review').length,
      diagnostic: actions.filter(a => a.type === 'diagnostic').length,
      transfer_test: actions.filter(a => a.type === 'transfer_test').length,
      rest: actions.filter(a => a.type === 'rest').length,
    };

    const uniqueSkills = new Set(
      actions.filter(a => a.skillId).map(a => a.skillId!)
    );

    return {
      totalActions: actions.length,
      actionsByType: byType,
      uniqueSkills: uniqueSkills.size,
      averagePriority: actions.length > 0
        ? actions.reduce((sum, a) => sum + a.priority, 0) / actions.length
        : 0,
    };
  }
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
export function createSessionPlanner(
  config: Partial<SessionPlannerConfig> = {},
  transferTests: TransferTest[] = [],
  transferResults: TransferTestResult[] = []
): SessionPlannerImpl {
  return new SessionPlannerImpl(config, transferTests, transferResults);
}
