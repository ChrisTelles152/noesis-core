/**
 * Bayesian Knowledge Tracing (BKT) Learner Model Engine
 *
 * Implements a classic BKT model for tracking skill mastery.
 * BKT uses four parameters per skill:
 * - pInit: Prior probability of mastery
 * - pLearn: Probability of transitioning from unknown to known
 * - pSlip: Probability of incorrect response when skill is known
 * - pGuess: Probability of correct response when skill is unknown
 *
 * DETERMINISM: All operations are pure and produce the same output
 * for the same input. No randomness, no side effects.
 */
import type { LearnerModel, LearnerModelEngine, SkillGraph, PracticeEvent } from '../constitution.js';
import type { ClockFn } from '../events/index.js';
/**
 * BKT parameters for model initialization
 */
export interface BKTParams {
    /** Prior probability of mastery (default: 0.3) */
    pInit: number;
    /** Probability of learning per opportunity (default: 0.1) */
    pLearn: number;
    /** Probability of slip - known but incorrect (default: 0.1) */
    pSlip: number;
    /** Probability of guess - unknown but correct (default: 0.2) */
    pGuess: number;
}
/**
 * Default BKT parameters (research-based starting points)
 */
export declare const DEFAULT_BKT_PARAMS: BKTParams;
/**
 * Concrete implementation of LearnerModelEngine using BKT
 */
export declare class BKTEngine implements LearnerModelEngine {
    private readonly defaultParams;
    private readonly clock;
    constructor(params?: Partial<BKTParams>, clock?: ClockFn);
    /**
     * Create a new learner model with cold start priors
     */
    createModel(learnerId: string, skillGraph: SkillGraph): LearnerModel;
    /**
     * Create initial skill probability with default parameters
     */
    private createSkillProbability;
    /**
     * Update model based on a practice event using BKT update rules
     *
     * BKT Update Algorithm:
     * 1. Calculate P(correct | mastered) = 1 - pSlip
     * 2. Calculate P(correct | not mastered) = pGuess
     * 3. Use Bayes' theorem to update P(mastery | observation)
     * 4. Apply learning transition probability
     */
    updateModel(model: LearnerModel, event: PracticeEvent): LearnerModel;
    /**
     * Get probability of mastery for a skill
     */
    getPMastery(model: LearnerModel, skillId: string): number;
    /**
     * Identify skills below mastery threshold
     */
    getUnmasteredSkills(model: LearnerModel, threshold: number): string[];
    /**
     * Serialize model for storage
     */
    serialize(model: LearnerModel): string;
    /**
     * Deserialize model from storage
     */
    deserialize(data: string): LearnerModel;
    /**
     * Initialize model from diagnostic results
     * Sets initial pMastery based on diagnostic scores
     */
    initializeFromDiagnostic(model: LearnerModel, diagnosticResults: Map<string, number>, timestamp: number): LearnerModel;
}
/**
 * Factory function to create a BKTEngine
 */
export declare function createBKTEngine(params?: Partial<BKTParams>, clock?: ClockFn): BKTEngine;
//# sourceMappingURL=BKTEngine.d.ts.map