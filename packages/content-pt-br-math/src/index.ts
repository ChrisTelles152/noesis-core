/**
 * @noesis/content-pt-br-math
 *
 * Brazilian Portuguese math content pack for Noesis (Phase-1 STEM wedge).
 * Bundles a 25-skill DAG, 50 practice items, and golden-path sequences
 * keyed to the canonical 5-stage loop.
 *
 * The pack is loaded synchronously: graph/items/sequences are JSON imported
 * at build time. `loadContentPack()` returns a fully validated `ContentPack`,
 * throwing if the underlying skill graph is malformed (cycles, missing
 * prerequisites, etc.) per the core graph validator.
 */

import { loadSkillGraphFromJSON, type SkillGraph, type ItemSkillMapping } from '@noesis-edu/core';
import graphData from './graph.json';
import itemsData from './items.json';
import goldenData from './goldenSequence.json';

export type AnswerType = 'numeric' | 'multiple-choice' | 'free-text';

export type CanonicalStage = 'concept_introduction' | 'practice' | 'application' | 'reflection';

export interface ContentItem {
  /** Stable identifier — referenced by goldenSequences and engine items */
  id: string;
  /** Primary skill the item exercises */
  primarySkillId: string;
  /** Skills implicitly involved (give partial credit on success) */
  secondarySkillIds: string[];
  /** Difficulty 0..1, used by diagnostic placement */
  difficulty: number;
  /** Question prompt in pt-BR */
  prompt: string;
  /** How the answer is collected and graded */
  answerType: AnswerType;
  /** Correct answer (string for free-text/multiple-choice, number for numeric) */
  correctAnswer: string | number;
  /** Choice list for multiple-choice items (must include correctAnswer) */
  alternatives?: string[];
  /** Step-by-step solution shown after grading, in pt-BR */
  workedSolution: string;
  /** Optional progressive hints in pt-BR */
  hints?: string[];
  /** Default canonical-loop stage this item is best suited for */
  stage?: CanonicalStage;
}

export interface GoldenSequenceStage {
  stage: CanonicalStage;
  /** Items to surface during this stage (may be empty for non-practice stages) */
  itemIds: string[];
}

export interface GoldenSequence {
  /** Stable identifier */
  id: string;
  /** Skill this sequence belongs to */
  skillId: string;
  /** Human-readable title in pt-BR */
  title: string;
  stages: GoldenSequenceStage[];
}

export interface ContentPack {
  /** Pack identifier */
  id: string;
  /** Locale tag */
  language: string;
  /** Pack version (semver) */
  version: string;
  /** Validated skill graph */
  skillGraph: SkillGraph;
  /** All practice items in the pack */
  items: ContentItem[];
  /** Curated golden-path sequences keyed to canonical stages */
  goldenSequences: GoldenSequence[];
  /** Item→skill mappings derived from items, ready for diagnostic engine */
  itemSkillMappings: ItemSkillMapping[];
}

/**
 * Load and validate the pt-BR math content pack.
 *
 * Throws if graph.json fails DAG validation (cycle, missing prerequisite,
 * invalid encompassedSkills). Items and sequences are typed-narrowed but not
 * cross-validated here — use the verification tests for that.
 */
export function loadContentPack(): ContentPack {
  const skillGraph = loadSkillGraphFromJSON(graphData);
  const items = itemsData.items as ContentItem[];

  const itemSkillMappings: ItemSkillMapping[] = items.map((it) => ({
    itemId: it.id,
    primarySkillId: it.primarySkillId,
    secondarySkillIds: it.secondarySkillIds,
    difficulty: it.difficulty,
  }));

  return {
    id: 'pt-br-math',
    language: 'pt-BR',
    version: graphData.version,
    skillGraph,
    items,
    goldenSequences: goldenData.sequences as GoldenSequence[],
    itemSkillMappings,
  };
}

export const CONTENT_PACK_ID = 'pt-br-math';
export const CONTENT_PACK_LANGUAGE = 'pt-BR';
