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
/** All four canonical-loop stages a transfer-test gate must see. */
const REQUIRED_STAGES = [
    'concept_introduction',
    'practice',
    'application',
    'reflection',
];
/**
 * Default session planner configuration
 */
export const DEFAULT_SESSION_PLANNER_CONFIG = {
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
 * Session Planner Implementation
 */
export class SessionPlannerImpl {
    config;
    transferTests;
    transferResults;
    constructor(config = {}, transferTests = [], transferResults = []) {
        this.config = { ...DEFAULT_SESSION_PLANNER_CONFIG, ...config };
        this.transferTests = transferTests;
        this.transferResults = transferResults;
    }
    /**
     * Get the next recommended action
     */
    getNextAction(learnerModel, skillGraph, memoryStates, config, stageHistory) {
        const mergedConfig = { ...this.config, ...config };
        const now = learnerModel.lastUpdated;
        const enforceLoop = !!mergedConfig.enforceCanonicalLoop;
        // When enforceCanonicalLoop is set, gate logic must work even before any
        // stage events have been recorded — treat absent stageHistory as empty.
        const effectiveStageHistory = enforceLoop
            ? (stageHistory ?? new Map())
            : undefined;
        // Priority 1: Due spaced retrieval items
        if (mergedConfig.enforceSpacedRetrieval) {
            const dueStates = this.getDueStates(memoryStates, now);
            if (dueStates.length > 0) {
                // Knock-out mode: pick the due review that covers the most other due skills
                if (mergedConfig.enableKnockOutReviews) {
                    const best = this.selectBestKnockOutReview(dueStates, skillGraph, now);
                    if (best)
                        return best;
                }
                const mostOverdue = dueStates[0];
                return {
                    type: 'review',
                    skillId: mostOverdue.skillId,
                    reason: 'Spaced retrieval due',
                    priority: this.calculateOverduePriority(mostOverdue, now),
                };
            }
        }
        // Priority 2: Transfer tests for skills at mastery (gated on canonical-loop
        // completeness when enforceCanonicalLoop is set).
        if (mergedConfig.requireTransferTests) {
            const transferAction = this.getTransferTestAction(learnerModel, skillGraph, effectiveStageHistory);
            if (transferAction) {
                return transferAction;
            }
        }
        // Priority 3: Error-focused practice
        const errorAction = this.getErrorFocusAction(learnerModel, skillGraph, memoryStates);
        if (errorAction) {
            return errorAction;
        }
        // Priority 3.5: Prerequisite re-validation probes
        if (mergedConfig.prerequisiteRevalidationEnabled) {
            const probeAction = this.getPrerequisiteProbeAction(learnerModel, skillGraph, mergedConfig);
            if (probeAction) {
                return probeAction;
            }
        }
        // Priority 4: New skill introduction (smallest leverage gap).
        // When enforceCanonicalLoop is set, a brand-new skill (no stages recorded
        // yet) yields a `concept_introduction` action instead of `practice`.
        const newSkillAction = this.getNewSkillAction(learnerModel, skillGraph, effectiveStageHistory);
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
    planSession(learnerModel, skillGraph, memoryStates, config, stageHistory) {
        const mergedConfig = { ...this.config, ...config };
        const actions = [];
        const now = learnerModel.lastUpdated;
        // State for tracking what we've already planned
        const plannedSkills = new Set();
        let itemCount = 0;
        while (itemCount < mergedConfig.targetItems) {
            // Get due reviews first
            if (mergedConfig.enforceSpacedRetrieval) {
                const dueStates = this.getDueStates(memoryStates, now).filter((s) => !plannedSkills.has(s.skillId));
                if (mergedConfig.enableKnockOutReviews && dueStates.length > 0) {
                    // Knock-out mode: greedy set-cover to minimize total reviews
                    const knockOutActions = this.selectKnockOutReviews(dueStates, skillGraph, now, mergedConfig.targetItems - itemCount);
                    for (const action of knockOutActions) {
                        if (itemCount >= mergedConfig.targetItems)
                            break;
                        actions.push(action);
                        if (action.skillId)
                            plannedSkills.add(action.skillId);
                        itemCount++;
                    }
                }
                else {
                    for (const state of dueStates) {
                        if (itemCount >= mergedConfig.targetItems)
                            break;
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
            }
            if (itemCount >= mergedConfig.targetItems)
                break;
            // Get next action excluding already planned skills
            const nextAction = this.getNextActionExcluding(learnerModel, skillGraph, memoryStates, config, plannedSkills, stageHistory);
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
    getDueStates(states, atTime) {
        return states
            .filter((s) => s.nextReview <= atTime)
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
    calculateOverduePriority(state, now) {
        const overdueDays = (now - state.nextReview) / (24 * 60 * 60 * 1000);
        return Math.min(100, 50 + overdueDays * this.config.overdueWeight);
    }
    /**
     * Get transfer test action if any skill is ready.
     *
     * When `stageHistory` is provided (caller opted in to canonical-loop
     * enforcement), the gate also requires all four stages
     * (`concept_introduction → practice → application → reflection`) to have
     * been recorded for the candidate skill before a transfer test is emitted.
     */
    getTransferTestAction(learnerModel, skillGraph, stageHistory) {
        const skillOrder = skillGraph.getTopologicalOrder();
        for (const skillId of skillOrder) {
            const pMastery = learnerModel.skillProbabilities.get(skillId)?.pMastery || 0;
            // Check if skill is ready for transfer testing
            if (pMastery >= this.config.transferTestThreshold) {
                // Canonical-loop gate: skip skills that have not yet completed all
                // four stages. When stageHistory is undefined, the gate is off.
                if (stageHistory) {
                    const skillStages = stageHistory.get(skillId);
                    const allStagesSeen = skillStages !== undefined && REQUIRED_STAGES.every((s) => skillStages.has(s));
                    if (!allStagesSeen)
                        continue;
                }
                // Check if transfer test is needed
                const skillTests = this.transferTests.filter((t) => t.skillId === skillId);
                const passedTests = new Set(this.transferResults.filter((r) => r.passed).map((r) => r.testId));
                const pendingTests = skillTests.filter((t) => !passedTests.has(t.id));
                if (pendingTests.length > 0) {
                    // Prioritize near transfer first
                    const nearTests = pendingTests.filter((t) => t.transferType === 'near');
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
    getErrorFocusAction(_learnerModel, _skillGraph, memoryStates) {
        // Find skills with recent failures (relearning state in memory)
        const relearningStates = memoryStates
            .filter((s) => s.state === 'relearning')
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
     *
     * When `stageHistory` is provided (caller opted in to canonical-loop
     * enforcement), a candidate skill with no stages recorded yet yields a
     * `concept_introduction` action instead of `practice` — the canonical
     * loop's first stage. Once a stage is recorded for the skill, behaviour
     * falls back to the regular `practice` recommendation.
     */
    getNewSkillAction(learnerModel, skillGraph, stageHistory) {
        const skillOrder = skillGraph.getTopologicalOrder();
        const candidates = [];
        for (const skillId of skillOrder) {
            const pMastery = learnerModel.skillProbabilities.get(skillId)?.pMastery || 0;
            // Skip already mastered skills
            if (pMastery >= this.config.masteryThreshold) {
                continue;
            }
            // Check if prerequisites are mastered
            const prereqs = skillGraph.getAllPrerequisites(skillId);
            const prereqsMastered = prereqs.every((prereqId) => {
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
        // Canonical-loop gate: if the planner has stage history available and
        // the candidate skill has no stages recorded yet, recommend
        // `concept_introduction` first.
        if (stageHistory) {
            const seen = stageHistory.get(target.skillId);
            if (!seen || seen.size === 0) {
                return {
                    type: 'concept_introduction',
                    skillId: target.skillId,
                    reason: `Concept introduction for new skill (leverage: ${target.leverage} dependents)`,
                    priority: 40 + target.leverage,
                };
            }
        }
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
    getConsolidationAction(learnerModel, skillGraph) {
        const skillOrder = skillGraph.getTopologicalOrder();
        const candidates = [];
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
    getNextActionExcluding(learnerModel, skillGraph, memoryStates, config, excludeSkills, stageHistory) {
        // Filter memory states
        const filteredStates = memoryStates.filter((s) => !excludeSkills.has(s.skillId));
        // Create a filtered learner model view
        const filteredModel = {
            ...learnerModel,
            skillProbabilities: new Map(Array.from(learnerModel.skillProbabilities.entries()).filter(([id]) => !excludeSkills.has(id))),
        };
        // Get next action with filtered data
        const action = this.getNextAction(filteredModel, skillGraph, filteredStates, config, stageHistory);
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
    /**
     * Get a prerequisite probe action when a mastered skill's foundation has decayed.
     * Scans topological order for skills where:
     * - The skill itself has pMastery >= threshold (appears mastered)
     * - But some prerequisite has pMastery < revalidation threshold
     * Returns a probe action for the weakest prerequisite.
     */
    getPrerequisiteProbeAction(learnerModel, skillGraph, config) {
        const revalThreshold = config.prerequisiteRevalidationThreshold ?? 0.7;
        const skillOrder = skillGraph.getTopologicalOrder();
        // Check from most advanced skills backward
        for (let i = skillOrder.length - 1; i >= 0; i--) {
            const skillId = skillOrder[i];
            const pMastery = learnerModel.skillProbabilities.get(skillId)?.pMastery ?? 0;
            if (pMastery < config.masteryThreshold)
                continue; // Only check mastered skills
            const prereqs = skillGraph.getAllPrerequisites(skillId);
            let weakestPrereq;
            let weakestMastery = Infinity;
            for (const prereqId of prereqs) {
                const prereqMastery = learnerModel.skillProbabilities.get(prereqId)?.pMastery ?? 0;
                if (prereqMastery < revalThreshold && prereqMastery < weakestMastery) {
                    weakestMastery = prereqMastery;
                    weakestPrereq = prereqId;
                }
            }
            if (weakestPrereq) {
                return {
                    type: 'prerequisite_probe',
                    skillId: weakestPrereq,
                    reason: `Prerequisite re-validation: "${weakestPrereq}" has decayed (${(weakestMastery * 100).toFixed(0)}%) while dependent "${skillId}" appears mastered`,
                    priority: 55,
                };
            }
        }
        return undefined;
    }
    /**
     * Select a single best knock-out review (for getNextAction).
     * Picks the due skill whose encompassed skills overlap most with other due skills.
     */
    selectBestKnockOutReview(dueStates, skillGraph, now) {
        const dueIds = new Set(dueStates.map((s) => s.skillId));
        let bestSkill;
        let bestCoverage = 0;
        for (const state of dueStates) {
            const encompassed = skillGraph.getEncompassedSkills(state.skillId);
            const coverage = encompassed.filter((id) => dueIds.has(id)).length;
            if (coverage > bestCoverage || (coverage === bestCoverage && !bestSkill)) {
                bestCoverage = coverage;
                bestSkill = state;
            }
        }
        // Only use knock-out if it actually covers something beyond itself
        if (bestSkill && bestCoverage > 0) {
            return {
                type: 'review',
                skillId: bestSkill.skillId,
                reason: `Knock-out review (covers ${bestCoverage} other due skill${bestCoverage > 1 ? 's' : ''})`,
                priority: this.calculateOverduePriority(bestSkill, now),
            };
        }
        return undefined;
    }
    /**
     * Greedy set-cover selection for knock-out reviews (for planSession).
     * Picks reviews that cover the most other due skills, capped at 50% of budget.
     */
    selectKnockOutReviews(dueStates, skillGraph, now, budget) {
        const actions = [];
        const remaining = new Set(dueStates.map((s) => s.skillId));
        const stateMap = new Map(dueStates.map((s) => [s.skillId, s]));
        const maxKnockOuts = Math.floor(budget * 0.5); // Cap: at most 50% of budget knocked out
        let knockedOut = 0;
        while (remaining.size > 0 && actions.length < budget) {
            // Find the skill that covers the most remaining due skills
            let bestSkillId;
            let bestCoverage = [];
            for (const skillId of remaining) {
                const encompassed = skillGraph.getEncompassedSkills(skillId);
                const coverage = encompassed.filter((id) => remaining.has(id));
                if (coverage.length > bestCoverage.length ||
                    (coverage.length === bestCoverage.length && (!bestSkillId || skillId < bestSkillId))) {
                    bestSkillId = skillId;
                    bestCoverage = coverage;
                }
            }
            if (!bestSkillId)
                break;
            const state = stateMap.get(bestSkillId);
            if (!state)
                break;
            const coveredCount = Math.min(bestCoverage.length, maxKnockOuts - knockedOut);
            const coveredSkills = bestCoverage.slice(0, coveredCount);
            actions.push({
                type: 'review',
                skillId: bestSkillId,
                reason: coveredSkills.length > 0
                    ? `Knock-out review (covers ${coveredSkills.length} other due skill${coveredSkills.length > 1 ? 's' : ''})`
                    : 'Spaced retrieval due',
                priority: this.calculateOverduePriority(state, now),
            });
            remaining.delete(bestSkillId);
            for (const covered of coveredSkills) {
                remaining.delete(covered);
                knockedOut++;
            }
        }
        return actions;
    }
    getSessionStats(actions) {
        const byType = {
            practice: actions.filter((a) => a.type === 'practice').length,
            review: actions.filter((a) => a.type === 'review').length,
            diagnostic: actions.filter((a) => a.type === 'diagnostic').length,
            transfer_test: actions.filter((a) => a.type === 'transfer_test').length,
            prerequisite_probe: actions.filter((a) => a.type === 'prerequisite_probe').length,
            rest: actions.filter((a) => a.type === 'rest').length,
            concept_introduction: actions.filter((a) => a.type === 'concept_introduction').length,
            application: actions.filter((a) => a.type === 'application').length,
            reflection: actions.filter((a) => a.type === 'reflection').length,
        };
        const uniqueSkills = new Set(actions.filter((a) => a.skillId).map((a) => a.skillId));
        return {
            totalActions: actions.length,
            actionsByType: byType,
            uniqueSkills: uniqueSkills.size,
            averagePriority: actions.length > 0 ? actions.reduce((sum, a) => sum + a.priority, 0) / actions.length : 0,
        };
    }
}
/**
 * Factory function to create a SessionPlanner
 */
export function createSessionPlanner(config = {}, transferTests = [], transferResults = []) {
    return new SessionPlannerImpl(config, transferTests, transferResults);
}
//# sourceMappingURL=SessionPlannerImpl.js.map