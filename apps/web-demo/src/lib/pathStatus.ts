/**
 * Path status helpers (Phase H4)
 *
 * Maps a learner's per-skill mastery estimate plus the prerequisite graph
 * onto one of four UI states the Path page renders. Pulled into its own
 * module so the gating logic is testable without React.
 */

import type { Skill, SkillGraph } from '@noesis-edu/core';

export type PathStatus = 'locked' | 'available' | 'inProgress' | 'mastered';

/**
 * Threshold the engine treats as mastered (matches DEFAULT_DIAGNOSTIC_CONFIG).
 * Hardcoded here rather than imported because the path UI only cares about
 * the visible binary "is this gate open?" — pulling the engine config in
 * would couple the UI to internals it shouldn't depend on.
 */
export const MASTERY_THRESHOLD = 0.7;

/**
 * The minimum estimate at which we say the learner has "started" a skill.
 * Below this we treat them as fresh-eyes on the topic.
 */
export const IN_PROGRESS_THRESHOLD = 0.3;

/**
 * The default prior the engine uses when there's no data on a skill yet.
 */
export const DEFAULT_PRIOR = 0.3;

/**
 * Compute the UI status of a skill given the learner's estimates and the
 * prerequisite graph. Order of checks matters: a locked skill stays locked
 * even if its own estimate happens to be high (which can happen post-
 * propagation), because the prereqs gate is what governs whether the UI
 * should let them practice it.
 */
export function computePathStatus(
  skill: Skill,
  estimates: Map<string, number>,
  _graph: SkillGraph
): PathStatus {
  for (const prereqId of skill.prerequisites) {
    const prereqEstimate = estimates.get(prereqId) ?? DEFAULT_PRIOR;
    if (prereqEstimate < MASTERY_THRESHOLD) {
      return 'locked';
    }
  }

  const own = estimates.get(skill.id) ?? DEFAULT_PRIOR;
  if (own >= MASTERY_THRESHOLD) return 'mastered';
  // Strict > so a learner sitting at exactly the default prior (0.3) — i.e.
  // we have no signal on this skill yet — reads as "available", not as
  // "in progress". "In progress" should mean "their last attempt moved the
  // needle above the prior."
  if (own > IN_PROGRESS_THRESHOLD) return 'inProgress';
  return 'available';
}

/**
 * Return the prerequisite skills that haven't reached the mastery
 * threshold yet — used to show the learner *which* topics are blocking.
 */
export function getMissingPrerequisites(
  skill: Skill,
  estimates: Map<string, number>,
  graph: SkillGraph
): Skill[] {
  const missing: Skill[] = [];
  for (const prereqId of skill.prerequisites) {
    const estimate = estimates.get(prereqId) ?? DEFAULT_PRIOR;
    if (estimate < MASTERY_THRESHOLD) {
      const prereq = graph.skills.get(prereqId);
      if (prereq) missing.push(prereq);
    }
  }
  return missing;
}

/**
 * Read the diagnostic estimates persisted by the Diagnostic page.
 * Returns an empty map if nothing is saved or the payload is malformed —
 * the UI treats that as "no data, use priors" rather than failing.
 */
export function loadEstimatesFromStorage(
  storageKey = 'noesis-diagnostic-estimates'
): Map<string, number> {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(storageKey);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as unknown;
    if (typeof obj !== 'object' || obj === null) return new Map();
    const map = new Map<string, number>();
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) map.set(k, v);
    }
    return map;
  } catch {
    return new Map();
  }
}
