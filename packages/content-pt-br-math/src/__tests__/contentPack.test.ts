/**
 * Content pack verification suite.
 *
 * The skill graph is the spine: if it validates, the rest of the pack
 * has something coherent to attach to. After that we cross-check
 * items.json and goldenSequence.json against the graph so a stray
 * skill-id rename can't silently leave dangling references.
 */

import { describe, it, expect } from 'vitest';
import { loadContentPack, type ContentItem } from '../index.js';

describe('@noesis/content-pt-br-math', () => {
  describe('skill graph', () => {
    it('loads without throwing (validates as a DAG)', () => {
      expect(() => loadContentPack()).not.toThrow();
    });

    it('has exactly 25 skills covering Phase-1 STEM scope', () => {
      const pack = loadContentPack();
      expect(pack.skillGraph.skills.size).toBe(25);
    });

    it('exposes pt-BR as the pack language', () => {
      const pack = loadContentPack();
      expect(pack.language).toBe('pt-BR');
      expect(pack.id).toBe('pt-br-math');
    });

    it('passes the engine validator', () => {
      const pack = loadContentPack();
      const result = pack.skillGraph.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('has every prerequisite resolvable to a real skill', () => {
      const pack = loadContentPack();
      const ids = new Set(Array.from(pack.skillGraph.skills.keys()));
      for (const skill of pack.skillGraph.skills.values()) {
        for (const prereq of skill.prerequisites) {
          expect(ids.has(prereq)).toBe(true);
        }
        for (const enc of skill.encompassedSkills ?? []) {
          expect(ids.has(enc)).toBe(true);
        }
      }
    });

    it('produces a topological order that respects every prerequisite edge', () => {
      const pack = loadContentPack();
      const order = pack.skillGraph.getTopologicalOrder();
      const position = new Map(order.map((id, i) => [id, i]));
      for (const skill of pack.skillGraph.skills.values()) {
        for (const prereq of skill.prerequisites) {
          expect(position.get(prereq)!).toBeLessThan(position.get(skill.id)!);
        }
      }
    });
  });

  describe('language', () => {
    it('uses Portuguese names — most carry pt-BR diacritics, none match English equivalents', () => {
      const pack = loadContentPack();
      const englishBlocklist = [
        'Addition',
        'Subtraction',
        'Multiplication',
        'Division',
        'Fractions',
        'Decimals',
        'Percentage',
        'Powers',
        'Variables',
        'Linear Equations',
        'Quadratic Equations',
        'Polynomials',
        'Angles',
        'Triangles',
        'Circle',
        'Areas and Volumes',
        'Similarity',
        'Trigonometry',
        'Logarithms',
        'Statistics',
        'Probability',
      ];
      const ptDiacritics = /[ãõáàâéêíóôúçÃÕÁÀÂÉÊÍÓÔÚÇ]/;
      let withDiacritics = 0;
      for (const skill of pack.skillGraph.skills.values()) {
        expect(englishBlocklist).not.toContain(skill.name);
        if (ptDiacritics.test(skill.name)) withDiacritics++;
      }
      // Loose floor: well over half of the 25 skill names should carry a
      // pt-BR diacritic. If a future translator strips them all, we'd want
      // to see this fail.
      expect(withDiacritics).toBeGreaterThanOrEqual(15);
    });

    it('writes item prompts in Portuguese (every prompt non-empty, none match English-only test phrases)', () => {
      const pack = loadContentPack();
      for (const item of pack.items) {
        expect(item.prompt.length).toBeGreaterThan(0);
        expect(item.prompt).not.toMatch(/^(How much is|What is|Solve|Calculate)\s/);
        expect(item.workedSolution.length).toBeGreaterThan(0);
      }
    });
  });

  describe('items', () => {
    it('has 50 practice items', () => {
      const pack = loadContentPack();
      expect(pack.items.length).toBe(50);
    });

    it('routes every item to a skill that exists in the graph', () => {
      const pack = loadContentPack();
      const ids = new Set(Array.from(pack.skillGraph.skills.keys()));
      for (const item of pack.items) {
        expect(ids.has(item.primarySkillId)).toBe(true);
        for (const sec of item.secondarySkillIds) {
          expect(ids.has(sec)).toBe(true);
        }
      }
    });

    it('covers every skill with at least one primary item (no orphan skills)', () => {
      const pack = loadContentPack();
      const covered = new Set(pack.items.map((it) => it.primarySkillId));
      for (const skillId of pack.skillGraph.skills.keys()) {
        expect(covered.has(skillId)).toBe(true);
      }
    });

    it('keeps difficulty in [0, 1]', () => {
      const pack = loadContentPack();
      for (const item of pack.items) {
        expect(item.difficulty).toBeGreaterThanOrEqual(0);
        expect(item.difficulty).toBeLessThanOrEqual(1);
      }
    });

    it('uses unique item IDs', () => {
      const pack = loadContentPack();
      const ids = pack.items.map((it) => it.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it('keeps multiple-choice items consistent (correctAnswer is in alternatives)', () => {
      const pack = loadContentPack();
      const mc = pack.items.filter((it: ContentItem) => it.answerType === 'multiple-choice');
      expect(mc.length).toBeGreaterThan(0);
      for (const item of mc) {
        expect(item.alternatives).toBeDefined();
        expect(item.alternatives!.length).toBeGreaterThanOrEqual(2);
        expect(item.alternatives!).toContain(item.correctAnswer);
      }
    });

    it('emits an itemSkillMapping for every item, derived from primary + secondary', () => {
      const pack = loadContentPack();
      expect(pack.itemSkillMappings.length).toBe(pack.items.length);
      const byId = new Map(pack.itemSkillMappings.map((m) => [m.itemId, m]));
      for (const item of pack.items) {
        const mapping = byId.get(item.id);
        expect(mapping).toBeDefined();
        expect(mapping!.primarySkillId).toBe(item.primarySkillId);
        expect(mapping!.secondarySkillIds).toEqual(item.secondarySkillIds);
        expect(mapping!.difficulty).toBe(item.difficulty);
      }
    });
  });

  describe('golden sequences', () => {
    it('targets only skills that exist in the graph', () => {
      const pack = loadContentPack();
      const skillIds = new Set(Array.from(pack.skillGraph.skills.keys()));
      for (const seq of pack.goldenSequences) {
        expect(skillIds.has(seq.skillId)).toBe(true);
      }
    });

    it('references only items that exist in the pack', () => {
      const pack = loadContentPack();
      const itemIds = new Set(pack.items.map((it) => it.id));
      for (const seq of pack.goldenSequences) {
        for (const stage of seq.stages) {
          for (const id of stage.itemIds) {
            expect(itemIds.has(id)).toBe(true);
          }
        }
      }
    });

    it('uses only canonical stage names', () => {
      const pack = loadContentPack();
      const allowed = new Set(['concept_introduction', 'practice', 'application', 'reflection']);
      for (const seq of pack.goldenSequences) {
        for (const stage of seq.stages) {
          expect(allowed.has(stage.stage)).toBe(true);
        }
      }
    });

    it('always orders stages with concept_introduction first and reflection last', () => {
      const pack = loadContentPack();
      for (const seq of pack.goldenSequences) {
        expect(seq.stages[0]?.stage).toBe('concept_introduction');
        expect(seq.stages[seq.stages.length - 1]?.stage).toBe('reflection');
      }
    });
  });
});
