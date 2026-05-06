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

// =============================================================================
// Types
// =============================================================================

export type MasteryLayer = 'unstarted' | 'learning' | 'learned' | 'mastered';

export interface LayeredMasteryConfig {
  learned: {
    pMasteryThreshold: number; // default 0.75
    minAttempts: number; // default 3
  };
  mastered: {
    pMasteryThreshold: number; // default 0.85
    minAttempts: number; // default 6
    minCorrect: number; // default 3
    minCalendarDays: number; // default 2
    coolingOffHours: number; // default 24
    requireLastCorrect: boolean; // default true
  };
}

export const DEFAULT_LAYERED_MASTERY_CONFIG: LayeredMasteryConfig = {
  learned: {
    pMasteryThreshold: 0.75,
    minAttempts: 3,
  },
  mastered: {
    pMasteryThreshold: 0.85,
    minAttempts: 6,
    minCorrect: 3,
    minCalendarDays: 2,
    coolingOffHours: 24,
    requireLastCorrect: true,
  },
};

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
  forSkill(skillId: string): { primary: ChannelId | null; secondary: ChannelId | null };
}

/**
 * Default mapping that returns null/null. Skills with no primary/secondary
 * declared still classify correctly via the single-channel and ≥2-mastered
 * paths of the aggregation rule.
 */
export const NO_CHANNEL_MAPPING: SkillChannelMapping = {
  forSkill: () => ({ primary: null, secondary: null }),
};

/**
 * Per-pack aggregate summary. Mirrors noesis-eng's PackMasterySummary.
 */
export interface PackMasterySummary {
  skillsLearned: number;
  skillsMastered: number;
  totalSkills: number;
  /** Mean pMastery across all (skill, channel) pairs with attempts > 0. */
  avgPMastery: number;
  channelBreakdown: Record<ChannelId, { learned: number; mastered: number; total: number }>;
}

// =============================================================================
// LayeredMasteryModel
// =============================================================================

const MS_PER_HOUR = 1000 * 60 * 60;

/**
 * Pure (state, now) -> classifications. No I/O.
 */
export class LayeredMasteryModel {
  private readonly config: LayeredMasteryConfig;
  private readonly channelMapping: SkillChannelMapping;

  constructor(
    config: Partial<LayeredMasteryConfig> = {},
    channelMapping: SkillChannelMapping = NO_CHANNEL_MAPPING
  ) {
    // Deep-merge so callers can override just one field of e.g. mastered.
    this.config = {
      learned: { ...DEFAULT_LAYERED_MASTERY_CONFIG.learned, ...(config.learned ?? {}) },
      mastered: { ...DEFAULT_LAYERED_MASTERY_CONFIG.mastered, ...(config.mastered ?? {}) },
    };
    this.channelMapping = channelMapping;
  }

  /**
   * Classify a single channel given its BKT state and the current time (ms).
   * Pure — replay-friendly.
   */
  classifyChannel(state: ChannelSkillProbability, now: number): ChannelStatus {
    const isLearned = this.checkLearned(state);
    const { isMastered, blockers } = this.checkMastered(state, now);

    let layer: MasteryLayer;
    if (isMastered) {
      layer = 'mastered';
    } else if (isLearned) {
      layer = 'learned';
    } else if (state.attempts > 0) {
      layer = 'learning';
    } else {
      layer = 'unstarted';
    }

    return {
      channel: state.channel,
      pMastery: state.pMastery,
      attempts: state.attempts,
      correctCount: state.correctCount,
      layer,
      blockers,
    };
  }

  /**
   * Aggregate a skill across its channels. Pure.
   *
   * If channelStates is empty, returns an unstarted SkillStatus with
   * the primary/secondary mapping from channelMapping (if any).
   */
  classifySkill(
    skillId: string,
    channelStates: ChannelSkillProbability[],
    now: number
  ): SkillStatus {
    const channels = channelStates.map((s) => this.classifyChannel(s, now));
    const { primary, secondary } = this.channelMapping.forSkill(skillId);

    const channelsWithData = channels.filter((c) => c.attempts > 0);
    const avgPMastery =
      channelsWithData.length > 0
        ? channelsWithData.reduce((sum, c) => sum + c.pMastery, 0) / channelsWithData.length
        : 0;

    const primaryStatus = primary !== null ? channels.find((c) => c.channel === primary) : undefined;
    const secondaryStatus =
      secondary !== null ? channels.find((c) => c.channel === secondary) : undefined;

    const masteredChannels = channels.filter((c) => c.layer === 'mastered');
    const isLearned = channels.some((c) => c.layer === 'learned' || c.layer === 'mastered');

    const isMastered =
      masteredChannels.length >= 2 ||
      (primaryStatus?.layer === 'mastered' &&
        (secondaryStatus?.layer === 'learned' || secondaryStatus?.layer === 'mastered')) ||
      (channelsWithData.length === 1 && channelsWithData[0].layer === 'mastered');

    let skillLayer: MasteryLayer;
    if (isMastered) {
      skillLayer = 'mastered';
    } else if (isLearned) {
      skillLayer = 'learned';
    } else if (channelsWithData.length > 0) {
      skillLayer = 'learning';
    } else {
      skillLayer = 'unstarted';
    }

    return {
      skillId,
      channels,
      layer: skillLayer,
      primaryChannel: primary,
      secondaryChannel: secondary,
      avgPMastery,
    };
  }

  /**
   * Classify every skill in a pack at once. Pure.
   *
   * @param allStates  Map<skillId, ChannelSkillProbability[]> — typically
   *                   produced by walking MultiChannelBKTEngine.getAllStates().
   */
  classifyPack(
    allStates: Map<string, ChannelSkillProbability[]>,
    now: number
  ): Map<string, SkillStatus> {
    const out = new Map<string, SkillStatus>();
    for (const [skillId, states] of allStates) {
      out.set(skillId, this.classifySkill(skillId, states, now));
    }
    return out;
  }

  /**
   * Aggregate counts per pack. Pure.
   */
  summarizePack(
    allStates: Map<string, ChannelSkillProbability[]>,
    now: number
  ): PackMasterySummary {
    let skillsLearned = 0;
    let skillsMastered = 0;
    let totalPMastery = 0;
    let totalChannelsWithData = 0;
    const channelBreakdown: Record<ChannelId, { learned: number; mastered: number; total: number }> =
      {};

    for (const [skillId, states] of allStates) {
      const status = this.classifySkill(skillId, states, now);
      if (status.layer === 'mastered') {
        skillsMastered++;
        skillsLearned++;
      } else if (status.layer === 'learned') {
        skillsLearned++;
      }

      for (const ch of status.channels) {
        if (!channelBreakdown[ch.channel]) {
          channelBreakdown[ch.channel] = { learned: 0, mastered: 0, total: 0 };
        }
        channelBreakdown[ch.channel].total++;
        if (ch.layer === 'mastered') {
          channelBreakdown[ch.channel].mastered++;
          channelBreakdown[ch.channel].learned++;
        } else if (ch.layer === 'learned') {
          channelBreakdown[ch.channel].learned++;
        }
        if (ch.attempts > 0) {
          totalPMastery += ch.pMastery;
          totalChannelsWithData++;
        }
      }
    }

    return {
      skillsLearned,
      skillsMastered,
      totalSkills: allStates.size,
      avgPMastery: totalChannelsWithData > 0 ? totalPMastery / totalChannelsWithData : 0,
      channelBreakdown,
    };
  }

  /**
   * Soft revocation: returns a new state with lastCorrect=false. The pMastery
   * value is preserved — only the gate flips. Re-meeting all six Mastered
   * conditions (typically one correct answer away) restores Mastered status.
   *
   * Pure — caller persists the returned state.
   */
  revokeOnError(state: ChannelSkillProbability, now: number): ChannelSkillProbability {
    return {
      ...state,
      lastCorrect: false,
      lastUpdated: now,
    };
  }

  // =============================================================================
  // Private gate checks
  // =============================================================================

  private checkLearned(state: ChannelSkillProbability): boolean {
    return (
      state.pMastery >= this.config.learned.pMasteryThreshold &&
      state.attempts >= this.config.learned.minAttempts
    );
  }

  private checkMastered(
    state: ChannelSkillProbability,
    now: number
  ): { isMastered: boolean; blockers: string[] } {
    const blockers: string[] = [];
    const m = this.config.mastered;

    if (state.pMastery < m.pMasteryThreshold) {
      blockers.push(
        `pMastery ${(state.pMastery * 100).toFixed(1)}% < ${m.pMasteryThreshold * 100}%`
      );
    }

    if (state.attempts < m.minAttempts) {
      blockers.push(`${state.attempts} attempts < ${m.minAttempts} required`);
    }

    if (state.correctCount < m.minCorrect) {
      blockers.push(`${state.correctCount} correct < ${m.minCorrect} required`);
    }

    if (state.correctDays.length < m.minCalendarDays) {
      blockers.push(
        `${state.correctDays.length} days with correct < ${m.minCalendarDays} required`
      );
    }

    const hoursSinceFirstSeen = (now - state.firstSeenAt) / MS_PER_HOUR;
    if (hoursSinceFirstSeen < m.coolingOffHours) {
      blockers.push(
        `Only ${hoursSinceFirstSeen.toFixed(1)}h since first seen, need ${m.coolingOffHours}h`
      );
    }

    if (m.requireLastCorrect && state.lastCorrect !== true) {
      blockers.push('Last attempt was not correct');
    }

    return { isMastered: blockers.length === 0, blockers };
  }
}

/**
 * Factory.
 */
export function createLayeredMasteryModel(
  config: Partial<LayeredMasteryConfig> = {},
  channelMapping: SkillChannelMapping = NO_CHANNEL_MAPPING
): LayeredMasteryModel {
  return new LayeredMasteryModel(config, channelMapping);
}

/**
 * Helper: build a SkillChannelMapping from a function.
 */
export function makeChannelMapping(
  fn: (skillId: string) => { primary: ChannelId | null; secondary: ChannelId | null }
): SkillChannelMapping {
  return { forSkill: fn };
}
