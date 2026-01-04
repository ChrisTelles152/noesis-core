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

import type {
  LearnerModel,
  LearnerModelEngine,
  SkillProbability,
  SkillGraph,
  PracticeEvent,
} from '../constitution';
import type { ClockFn } from '../events';

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
export const DEFAULT_BKT_PARAMS: BKTParams = {
  pInit: 0.3,
  pLearn: 0.1,
  pSlip: 0.1,
  pGuess: 0.2,
};

/**
 * Concrete implementation of LearnerModelEngine using BKT
 */
export class BKTEngine implements LearnerModelEngine {
  private readonly defaultParams: BKTParams;
  private readonly clock: ClockFn;

  constructor(
    params: Partial<BKTParams> = {},
    clock: ClockFn = () => Date.now()
  ) {
    this.defaultParams = { ...DEFAULT_BKT_PARAMS, ...params };
    this.clock = clock;
  }

  /**
   * Create a new learner model with cold start priors
   */
  createModel(learnerId: string, skillGraph: SkillGraph): LearnerModel {
    const now = this.clock();
    const skillProbabilities = new Map<string, SkillProbability>();

    // Initialize each skill with default BKT parameters
    for (const [skillId] of skillGraph.skills) {
      skillProbabilities.set(skillId, this.createSkillProbability(skillId, now));
    }

    return {
      learnerId,
      skillProbabilities,
      totalEvents: 0,
      createdAt: now,
      lastUpdated: now,
    };
  }

  /**
   * Create initial skill probability with default parameters
   */
  private createSkillProbability(skillId: string, timestamp: number): SkillProbability {
    return {
      skillId,
      pMastery: this.defaultParams.pInit,
      pSlip: this.defaultParams.pSlip,
      pGuess: this.defaultParams.pGuess,
      pLearn: this.defaultParams.pLearn,
      lastUpdated: timestamp,
    };
  }

  /**
   * Update model based on a practice event using BKT update rules
   *
   * BKT Update Algorithm:
   * 1. Calculate P(correct | mastered) = 1 - pSlip
   * 2. Calculate P(correct | not mastered) = pGuess
   * 3. Use Bayes' theorem to update P(mastery | observation)
   * 4. Apply learning transition probability
   */
  updateModel(model: LearnerModel, event: PracticeEvent): LearnerModel {
    const { skillId, correct } = event;
    const now = event.timestamp;

    // Get current skill probability (or create if missing)
    let skillProb = model.skillProbabilities.get(skillId);
    if (!skillProb) {
      skillProb = this.createSkillProbability(skillId, now);
    }

    // BKT Update
    const pMastery = skillProb.pMastery;
    const pSlip = skillProb.pSlip;
    const pGuess = skillProb.pGuess;
    const pLearn = skillProb.pLearn;

    // Calculate posterior probability of mastery given observation
    let pMasteryPosterior: number;

    if (correct) {
      // P(mastery | correct) using Bayes' theorem
      // P(correct | mastery) = 1 - pSlip
      // P(correct | not mastery) = pGuess
      // P(correct) = P(correct|mastery)*P(mastery) + P(correct|not mastery)*P(not mastery)
      const pCorrect = (1 - pSlip) * pMastery + pGuess * (1 - pMastery);
      pMasteryPosterior = ((1 - pSlip) * pMastery) / pCorrect;
    } else {
      // P(mastery | incorrect) using Bayes' theorem
      // P(incorrect | mastery) = pSlip
      // P(incorrect | not mastery) = 1 - pGuess
      const pIncorrect = pSlip * pMastery + (1 - pGuess) * (1 - pMastery);
      pMasteryPosterior = (pSlip * pMastery) / pIncorrect;
    }

    // Apply learning transition: even after an observation, learner might learn
    // P(mastery after) = P(mastery after observation) + P(not mastery after observation) * P(learn)
    const pMasteryFinal = pMasteryPosterior + (1 - pMasteryPosterior) * pLearn;

    // Clamp to valid probability range
    const clampedPMastery = Math.max(0, Math.min(1, pMasteryFinal));

    // Create updated skill probability
    const updatedSkillProb: SkillProbability = {
      ...skillProb,
      pMastery: clampedPMastery,
      lastUpdated: now,
    };

    // Create new model with updated skill probability
    const newSkillProbabilities = new Map(model.skillProbabilities);
    newSkillProbabilities.set(skillId, updatedSkillProb);

    return {
      ...model,
      skillProbabilities: newSkillProbabilities,
      totalEvents: model.totalEvents + 1,
      lastUpdated: now,
    };
  }

  /**
   * Get probability of mastery for a skill
   */
  getPMastery(model: LearnerModel, skillId: string): number {
    const skillProb = model.skillProbabilities.get(skillId);
    return skillProb ? skillProb.pMastery : this.defaultParams.pInit;
  }

  /**
   * Identify skills below mastery threshold
   */
  getUnmasteredSkills(model: LearnerModel, threshold: number): string[] {
    const unmastered: string[] = [];

    for (const [skillId, skillProb] of model.skillProbabilities) {
      if (skillProb.pMastery < threshold) {
        unmastered.push(skillId);
      }
    }

    // Sort for determinism
    return unmastered.sort();
  }

  /**
   * Serialize model for storage
   */
  serialize(model: LearnerModel): string {
    // Convert Map to array for JSON serialization
    const skillProbsArray: [string, SkillProbability][] = [];
    for (const [skillId, prob] of model.skillProbabilities) {
      skillProbsArray.push([skillId, prob]);
    }

    return JSON.stringify({
      learnerId: model.learnerId,
      skillProbabilities: skillProbsArray,
      totalEvents: model.totalEvents,
      createdAt: model.createdAt,
      lastUpdated: model.lastUpdated,
    });
  }

  /**
   * Deserialize model from storage
   */
  deserialize(data: string): LearnerModel {
    const parsed = JSON.parse(data);

    const skillProbabilities = new Map<string, SkillProbability>();
    for (const [skillId, prob] of parsed.skillProbabilities) {
      skillProbabilities.set(skillId, prob);
    }

    return {
      learnerId: parsed.learnerId,
      skillProbabilities,
      totalEvents: parsed.totalEvents,
      createdAt: parsed.createdAt,
      lastUpdated: parsed.lastUpdated,
    };
  }

  /**
   * Initialize model from diagnostic results
   * Sets initial pMastery based on diagnostic scores
   */
  initializeFromDiagnostic(
    model: LearnerModel,
    diagnosticResults: Map<string, number>,
    timestamp: number
  ): LearnerModel {
    const newSkillProbabilities = new Map(model.skillProbabilities);

    for (const [skillId, score] of diagnosticResults) {
      const existing = newSkillProbabilities.get(skillId);
      if (existing) {
        // Set pMastery based on diagnostic score (0-1)
        newSkillProbabilities.set(skillId, {
          ...existing,
          pMastery: score,
          lastUpdated: timestamp,
        });
      } else {
        // Create new skill probability with diagnostic score as initial pMastery
        newSkillProbabilities.set(skillId, {
          skillId,
          pMastery: score,
          pSlip: this.defaultParams.pSlip,
          pGuess: this.defaultParams.pGuess,
          pLearn: this.defaultParams.pLearn,
          lastUpdated: timestamp,
        });
      }
    }

    return {
      ...model,
      skillProbabilities: newSkillProbabilities,
      lastUpdated: timestamp,
    };
  }
}

/**
 * Factory function to create a BKTEngine
 */
export function createBKTEngine(
  params: Partial<BKTParams> = {},
  clock: ClockFn = () => Date.now()
): BKTEngine {
  return new BKTEngine(params, clock);
}
