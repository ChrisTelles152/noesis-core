/**
 * LayeredMasteryModel — Learned/Mastered classification on top of MCBKT
 *
 * Two tiers, both gated on multiple signals (per the converged eng+math
 * defaults):
 *
 *   **Learned**  (lower, "knows it"):
 *     - pMastery >= 0.75
 *     - attempts >= 3
 *
 *   **Mastered** (higher, "knows it durably"):
 *     - pMastery >= 0.85
 *     - attempts >= 6
 *     - correctCount >= 3
 *     - correctDays.length >= 2 (correct answers span ≥2 calendar days)
 *     - (now - firstSeenAt) >= 24 hours (cooling off)
 *     - lastCorrect === true (recent evidence)
 *
 * Each unmet condition is reported as a human-readable blocker string for
 * UI use (e.g., "4 attempts < 6 required").
 *
 * Skill-level aggregation across channels (see classifySkill):
 *   masteredChannels.length >= 2
 *   || (primary mastered AND secondary learned)
 *   || (channelsWithData.length === 1 AND it's mastered)  [single-channel fallback]
 *
 * Soft revocation: revokeOnError() sets lastCorrect=false. It does NOT mutate
 * pMastery — the BKT estimate persists. The mastery aggregator will then
 * report not-mastered until the learner gets the next attempt right and meets
 * all six gates again. Hard revocation (zeroing pMastery) would break BKT.
 *
 * Ported logic from:
 *   - noesis-eng/banjul/src/lib/noesis/masteryService.ts (full pattern)
 *   - noesis-eng/banjul/docs/PHASE_H_AUDIT.md §4 (recommended core API)
 *
 * KEY DIFFERENCE FROM SOURCE: pure functions only — no Supabase I/O. The
 * eng `revokeOnError` did a DB update; core's version returns a new state
 * object. App layer wires persistence via OptimisticLockingStateStore (H-1.D.4).
 */
import type { ChannelId, ChannelSkillProbability } from '../learner/MultiChannelBKTEngine.js';
export type MasteryLayer = 'unstarted' | 'learning' | 'learned' | 'mastered';
export interface LayeredMasteryConfig {
    learned: {
        pMasteryThreshold: number;
        minAttempts: number;
    };
    mastered: {
        pMasteryThreshold: number;
        minAttempts: number;
        minCorrect: number;
        minCalendarDays: number;
        coolingOffHours: number;
        requireLastCorrect: boolean;
    };
}
export declare const DEFAULT_LAYERED_MASTERY_CONFIG: LayeredMasteryConfig;
/**
 * Per-channel classification result.
 */
export interface ChannelStatus {
    channel: ChannelId;
    pMastery: number;
    attempts: number;
    correctCount: number;
    layer: MasteryLayer;
    /** Human-readable reasons the channel did not reach Mastered. */
    blockers: string[];
}
/**
 * Per-skill classification result aggregated across all channels for that skill.
 */
export interface SkillStatus {
    skillId: string;
    channels: ChannelStatus[];
    layer: MasteryLayer;
    primaryChannel: ChannelId | null;
    secondaryChannel: ChannelId | null;
    /** Mean pMastery across all channels with data (0 if no channels). */
    avgPMastery: number;
}
/**
 * Pack-supplied mapping from skill ID to primary/secondary channels.
 *
 * Examples (eng vertical):
 *   - vocabulary skills: { primary: "recog_mc", secondary: "prod_typed" }
 *   - grammar skills:    { primary: "cloze",    secondary: "prod_typed" }
 *
 * The skill-category-to-channels mapping is pack-specific. Core ships
 * NO_CHANNEL_MAPPING which returns null/null — callers that don't supply a
 * mapping fall back to the single-channel-with-data path of the aggregation
 * rule, which works fine for single-channel verticals like delf.
 */
export interface SkillChannelMapping {
    forSkill(skillId: string): {
        primary: ChannelId | null;
        secondary: ChannelId | null;
    };
}
/**
 * Default mapping that returns null/null. Skills with no primary/secondary
 * declared still classify correctly via the single-channel and ≥2-mastered
 * paths of the aggregation rule.
 */
export declare const NO_CHANNEL_MAPPING: SkillChannelMapping;
/**
 * Per-pack aggregate summary. Mirrors noesis-eng's PackMasterySummary.
 */
export interface PackMasterySummary {
    skillsLearned: number;
    skillsMastered: number;
    totalSkills: number;
    /** Mean pMastery across all (skill, channel) pairs with attempts > 0. */
    avgPMastery: number;
    channelBreakdown: Record<ChannelId, {
        learned: number;
        mastered: number;
        total: number;
    }>;
}
/**
 * Pure (state, now) -> classifications. No I/O.
 */
export declare class LayeredMasteryModel {
    private readonly config;
    private readonly channelMapping;
    constructor(config?: Partial<LayeredMasteryConfig>, channelMapping?: SkillChannelMapping);
    /**
     * Classify a single channel given its BKT state and the current time (ms).
     * Pure — replay-friendly.
     */
    classifyChannel(state: ChannelSkillProbability, now: number): ChannelStatus;
    /**
     * Aggregate a skill across its channels. Pure.
     *
     * If channelStates is empty, returns an unstarted SkillStatus with
     * the primary/secondary mapping from channelMapping (if any).
     */
    classifySkill(skillId: string, channelStates: ChannelSkillProbability[], now: number): SkillStatus;
    /**
     * Classify every skill in a pack at once. Pure.
     *
     * @param allStates  Map<skillId, ChannelSkillProbability[]> — typically
     *                   produced by walking MultiChannelBKTEngine.getAllStates().
     */
    classifyPack(allStates: Map<string, ChannelSkillProbability[]>, now: number): Map<string, SkillStatus>;
    /**
     * Aggregate counts per pack. Pure.
     */
    summarizePack(allStates: Map<string, ChannelSkillProbability[]>, now: number): PackMasterySummary;
    /**
     * Soft revocation: returns a new state with lastCorrect=false. The pMastery
     * value is preserved — only the gate flips. Re-meeting all six Mastered
     * conditions (typically one correct answer away) restores Mastered status.
     *
     * Pure — caller persists the returned state.
     */
    revokeOnError(state: ChannelSkillProbability, now: number): ChannelSkillProbability;
    private checkLearned;
    private checkMastered;
}
/**
 * Factory.
 */
export declare function createLayeredMasteryModel(config?: Partial<LayeredMasteryConfig>, channelMapping?: SkillChannelMapping): LayeredMasteryModel;
/**
 * Helper: build a SkillChannelMapping from a function.
 */
export declare function makeChannelMapping(fn: (skillId: string) => {
    primary: ChannelId | null;
    secondary: ChannelId | null;
}): SkillChannelMapping;
//# sourceMappingURL=LayeredMasteryModel.d.ts.map