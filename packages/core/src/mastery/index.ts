/**
 * Layered Mastery Module
 *
 * Learned/Mastered tier classification with calendar-day cooling-off and
 * per-skill channel aggregation. Pure functions only — no I/O.
 *
 * Consumes ChannelSkillProbability from MultiChannelBKTEngine.
 */

export {
  LayeredMasteryModel,
  createLayeredMasteryModel,
  makeChannelMapping,
  DEFAULT_LAYERED_MASTERY_CONFIG,
  NO_CHANNEL_MAPPING,
  type MasteryLayer,
  type LayeredMasteryConfig,
  type ChannelStatus,
  type SkillStatus,
  type SkillChannelMapping,
  type PackMasterySummary,
} from './LayeredMasteryModel.js';
