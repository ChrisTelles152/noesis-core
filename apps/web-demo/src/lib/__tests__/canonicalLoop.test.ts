/**
 * Canonical-loop helper tests (Phase H5)
 *
 * Pins the picker preference order so a future content-pack reshuffle
 * can't silently regress which item shows up at which stage.
 */

import { describe, it, expect } from 'vitest';
import { loadContentPack } from '@noesis/content-pt-br-math';
import { CANONICAL_LOOP_STAGES, pickItemForStage, gradeAnswer } from '../canonicalLoop';

const pack = loadContentPack();

describe('CANONICAL_LOOP_STAGES', () => {
  it('lists exactly 4 stages in canonical order', () => {
    expect(CANONICAL_LOOP_STAGES).toEqual([
      'concept_introduction',
      'practice',
      'application',
      'reflection',
    ]);
  });
});

describe('pickItemForStage', () => {
  it('uses the golden sequence when one exists for the skill', () => {
    // intro_adicao golden sequence sets practice → adi_001, application → adi_002
    const practice = pickItemForStage('adicao', 'practice', pack);
    expect(practice?.id).toBe('adi_001');
    const application = pickItemForStage('adicao', 'application', pack);
    expect(application?.id).toBe('adi_002');
  });

  it('falls back to a stage-tagged item when no golden sequence is defined', () => {
    // multiplicacao isn't in goldenSequences but mul_001 is stage="practice"
    const practice = pickItemForStage('multiplicacao', 'practice', pack);
    expect(practice?.id).toBe('mul_001');
    const application = pickItemForStage('multiplicacao', 'application', pack);
    expect(application?.id).toBe('mul_002');
  });

  it('returns the first skill item as a last resort when no stage match exists', () => {
    // sistemas_lineares: no golden sequence and items are stage practice/application
    // Asking for 'reflection' should fall through to the first item.
    const reflection = pickItemForStage('sistemas_lineares', 'reflection', pack);
    expect(reflection).toBeDefined();
    expect(reflection!.primarySkillId).toBe('sistemas_lineares');
  });

  it('returns undefined when no item exists for the skill', () => {
    expect(pickItemForStage('nonexistent_skill', 'practice', pack)).toBeUndefined();
  });
});

describe('gradeAnswer', () => {
  it('grades a numeric item correctly with both . and , decimal separators', () => {
    const item = {
      id: 'test',
      primarySkillId: 'x',
      secondarySkillIds: [],
      difficulty: 0.5,
      prompt: '',
      answerType: 'numeric' as const,
      correctAnswer: 0.5,
      workedSolution: '',
    };
    expect(gradeAnswer(item, '0.5')).toBe(true);
    expect(gradeAnswer(item, '0,5')).toBe(true); // pt-BR comma
    expect(gradeAnswer(item, ' 0.5 ')).toBe(true);
    expect(gradeAnswer(item, '0.6')).toBe(false);
    expect(gradeAnswer(item, '')).toBe(false);
    expect(gradeAnswer(item, 'abc')).toBe(false);
  });

  it('grades free-text and multiple-choice case-insensitively after trim', () => {
    const item = {
      id: 'test',
      primarySkillId: 'x',
      secondarySkillIds: [],
      difficulty: 0.5,
      prompt: '',
      answerType: 'free-text' as const,
      correctAnswer: '2/3',
      workedSolution: '',
    };
    expect(gradeAnswer(item, '2/3')).toBe(true);
    expect(gradeAnswer(item, ' 2/3 ')).toBe(true);
    expect(gradeAnswer(item, '3/4')).toBe(false);
  });
});
