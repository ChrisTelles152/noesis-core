import { describe, it, expect } from 'vitest';
import { createSkillGraph } from '../graph/SkillGraphImpl.js';
import { loadSkillGraphFromJSON, exportSkillGraphToJSON } from '../graph/loader.js';
import type { Skill } from '../constitution.js';

describe('Encompassing Graph', () => {
  describe('getEncompassedSkills', () => {
    it('should return direct encompassed skills', () => {
      const skills: Skill[] = [
        { id: 'add', name: 'Addition', prerequisites: [] },
        { id: 'sub', name: 'Subtraction', prerequisites: [] },
        { id: 'div', name: 'Division', prerequisites: ['add'], encompassedSkills: ['add', 'sub'] },
      ];
      const graph = createSkillGraph(skills);

      expect(graph.getEncompassedSkills('div')).toEqual(['add', 'sub']);
    });

    it('should return empty array for skill with no encompassed skills', () => {
      const skills: Skill[] = [
        { id: 'add', name: 'Addition', prerequisites: [] },
      ];
      const graph = createSkillGraph(skills);

      expect(graph.getEncompassedSkills('add')).toEqual([]);
    });

    it('should return empty array for nonexistent skill', () => {
      const graph = createSkillGraph([]);
      expect(graph.getEncompassedSkills('nonexistent')).toEqual([]);
    });
  });

  describe('getAllEncompassedSkills', () => {
    it('should return transitive encompassed skills', () => {
      // div encompasses mul, mul encompasses add
      const skills: Skill[] = [
        { id: 'add', name: 'Addition', prerequisites: [] },
        { id: 'mul', name: 'Multiplication', prerequisites: ['add'], encompassedSkills: ['add'] },
        { id: 'div', name: 'Division', prerequisites: ['mul'], encompassedSkills: ['mul'] },
      ];
      const graph = createSkillGraph(skills);

      const all = graph.getAllEncompassedSkills('div');
      expect(all).toContain('mul');
      expect(all).toContain('add');
      expect(all).toHaveLength(2);
    });

    it('should handle diamond patterns without duplicates', () => {
      // calc encompasses both algebra and geometry, both encompass arithmetic
      const skills: Skill[] = [
        { id: 'arith', name: 'Arithmetic', prerequisites: [] },
        { id: 'alg', name: 'Algebra', prerequisites: ['arith'], encompassedSkills: ['arith'] },
        { id: 'geo', name: 'Geometry', prerequisites: ['arith'], encompassedSkills: ['arith'] },
        { id: 'calc', name: 'Calculus', prerequisites: ['alg', 'geo'], encompassedSkills: ['alg', 'geo'] },
      ];
      const graph = createSkillGraph(skills);

      const all = graph.getAllEncompassedSkills('calc');
      expect(all).toContain('alg');
      expect(all).toContain('geo');
      expect(all).toContain('arith');
      // No duplicates
      expect(new Set(all).size).toBe(all.length);
    });

    it('should return empty array for leaf skill', () => {
      const skills: Skill[] = [
        { id: 'add', name: 'Addition', prerequisites: [] },
      ];
      const graph = createSkillGraph(skills);

      expect(graph.getAllEncompassedSkills('add')).toEqual([]);
    });

    it('should not include the skill itself', () => {
      const skills: Skill[] = [
        { id: 'add', name: 'Addition', prerequisites: [] },
        { id: 'mul', name: 'Multiplication', prerequisites: [], encompassedSkills: ['add'] },
      ];
      const graph = createSkillGraph(skills);

      const all = graph.getAllEncompassedSkills('mul');
      expect(all).not.toContain('mul');
      expect(all).toEqual(['add']);
    });
  });

  describe('validation', () => {
    it('should detect invalid encompassed skill references', () => {
      const skills: Skill[] = [
        { id: 'add', name: 'Addition', prerequisites: [], encompassedSkills: ['nonexistent'] },
      ];
      const graph = createSkillGraph(skills);
      const result = graph.validate();

      expect(result.valid).toBe(false);
      const err = result.errors.find((e) => e.type === 'INVALID_ENCOMPASSED_SKILL');
      expect(err).toBeDefined();
      expect(err!.affectedSkills).toContain('add');
      expect(err!.affectedSkills).toContain('nonexistent');
    });

    it('should detect encompassing cycles', () => {
      // a encompasses b, b encompasses a
      const skills: Skill[] = [
        { id: 'a', name: 'A', prerequisites: [], encompassedSkills: ['b'] },
        { id: 'b', name: 'B', prerequisites: [], encompassedSkills: ['a'] },
      ];
      const graph = createSkillGraph(skills);
      const result = graph.validate();

      expect(result.valid).toBe(false);
      const err = result.errors.find((e) => e.type === 'ENCOMPASSING_CYCLE');
      expect(err).toBeDefined();
      expect(err!.affectedSkills).toContain('a');
      expect(err!.affectedSkills).toContain('b');
    });

    it('should detect self-encompassing cycle', () => {
      const skills: Skill[] = [
        { id: 'a', name: 'A', prerequisites: [], encompassedSkills: ['a'] },
      ];
      const graph = createSkillGraph(skills);
      const result = graph.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'ENCOMPASSING_CYCLE')).toBe(true);
    });

    it('should pass validation for valid encompassing graph', () => {
      const skills: Skill[] = [
        { id: 'add', name: 'Addition', prerequisites: [] },
        { id: 'mul', name: 'Multiplication', prerequisites: ['add'], encompassedSkills: ['add'] },
        { id: 'div', name: 'Division', prerequisites: ['mul'], encompassedSkills: ['mul'] },
      ];
      const graph = createSkillGraph(skills);
      const result = graph.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow prerequisite cycles and encompassing cycles to be reported independently', () => {
      const skills: Skill[] = [
        { id: 'a', name: 'A', prerequisites: ['b'], encompassedSkills: [] },
        { id: 'b', name: 'B', prerequisites: ['a'], encompassedSkills: ['a'] },
      ];
      // a has encompassedSkills:[] so no encompassing cycle from a
      // b encompasses a, but a doesn't encompass b — no encompassing cycle
      // BUT a→b→a is a prerequisite cycle
      const graph = createSkillGraph(skills);
      const result = graph.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.type === 'CYCLE_DETECTED')).toBe(true);
      expect(result.errors.some((e) => e.type === 'ENCOMPASSING_CYCLE')).toBe(false);
    });
  });

  describe('removeSkill cleans up encompassing references', () => {
    it('should remove skill from other skills encompassedSkills arrays', () => {
      const skills: Skill[] = [
        { id: 'add', name: 'Addition', prerequisites: [] },
        { id: 'mul', name: 'Multiplication', prerequisites: ['add'], encompassedSkills: ['add'] },
      ];
      const graph = createSkillGraph(skills);

      graph.removeSkill('add');

      const mul = graph.getSkill('mul');
      expect(mul!.encompassedSkills).toEqual([]);
      expect(mul!.prerequisites).toEqual([]);
    });
  });

  describe('loader round-trip', () => {
    it('should preserve encompassedSkills through load/export cycle', () => {
      const json = {
        version: '1.0.0',
        skills: [
          { id: 'add', name: 'Addition', prerequisites: [] },
          { id: 'mul', name: 'Multiplication', prerequisites: ['add'], encompassedSkills: ['add'] },
          { id: 'div', name: 'Division', prerequisites: ['mul'], encompassedSkills: ['mul', 'add'] },
        ],
      };

      const graph = loadSkillGraphFromJSON(json);
      const exported = exportSkillGraphToJSON(graph);

      const mulExported = exported.skills.find((s) => s.id === 'mul');
      expect(mulExported!.encompassedSkills).toEqual(['add']);

      const divExported = exported.skills.find((s) => s.id === 'div');
      expect(divExported!.encompassedSkills).toEqual(['mul', 'add']);
    });

    it('should load graph without encompassedSkills (backward compatible)', () => {
      const json = {
        version: '1.0.0',
        skills: [
          { id: 'add', name: 'Addition', prerequisites: [] },
          { id: 'mul', name: 'Multiplication', prerequisites: ['add'] },
        ],
      };

      const graph = loadSkillGraphFromJSON(json);
      expect(graph.getEncompassedSkills('mul')).toEqual([]);
    });
  });
});
