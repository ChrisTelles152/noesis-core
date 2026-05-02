/**
 * Canonical-loop helpers (Phase H5)
 *
 * The 5-stage canonical loop the engine codifies (concept_introduction →
 * practice → application → reflection) needs an item picker on the UI
 * side: given a skillId and a stage, what concrete content do we surface?
 *
 * Picker preference:
 *   1. golden sequence for this skill, if one exists in the pack
 *   2. an item flagged `stage: <wanted>` for this skill
 *   3. the first item primary-tagged to this skill
 *   4. nothing — caller renders a "no item, continue" fallback
 *
 * Pulled out of the page component so it's testable without React.
 */

import type {
  ContentPack,
  ContentItem,
  CanonicalStage,
} from '@noesis/content-pt-br-math';

/**
 * The four canonical stages the engine ships, in the order the UI walks
 * a learner through them. `spaced` and `transfer_test` are SessionAction
 * types but live outside this synchronous loop — they're scheduled later
 * by the engine's memory scheduler / transfer gate.
 */
export const CANONICAL_LOOP_STAGES: CanonicalStage[] = [
  'concept_introduction',
  'practice',
  'application',
  'reflection',
];

export function pickItemForStage(
  skillId: string,
  stage: CanonicalStage,
  pack: ContentPack,
): ContentItem | undefined {
  const sequence = pack.goldenSequences.find((s) => s.skillId === skillId);
  if (sequence) {
    const stageData = sequence.stages.find((s) => s.stage === stage);
    if (stageData && stageData.itemIds.length > 0) {
      const found = pack.items.find((it) => it.id === stageData.itemIds[0]);
      if (found) return found;
    }
  }

  const skillItems = pack.items.filter((it) => it.primarySkillId === skillId);
  const stageMatch = skillItems.find((it) => it.stage === stage);
  if (stageMatch) return stageMatch;

  return skillItems[0];
}

/**
 * Grade an answer string against an item's expected answer.
 * Mirrors the diagnostic page's grading so behaviour is consistent.
 */
export function gradeAnswer(item: ContentItem, raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return false;

  if (item.answerType === 'numeric') {
    const num = Number(trimmed.replace(',', '.'));
    return Number.isFinite(num) && num === Number(item.correctAnswer);
  }

  return trimmed.toLowerCase() === String(item.correctAnswer).trim().toLowerCase();
}
