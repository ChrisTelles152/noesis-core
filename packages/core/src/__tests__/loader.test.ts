/**
 * Skill Graph Loader Tests
 *
 * Tests for JSON loading and validation of skill graphs.
 */

import { describe, it, expect } from 'vitest';

import {
  loadSkillGraphFromJSON,
  parseSkillGraph,
  exportSkillGraphToJSON,
  SKILL_GRAPH_SCHEMA_VERSION,
  type SkillGraphJSON,
} from '../graph';
import { createSkillGraph } from '../graph';

// =============================================================================
// VALID GRAPH LOADING
// =============================================================================

describe('loadSkillGraphFromJSON', () => {
  it('should load a valid graph', () => {
    const json: SkillGraphJSON = {
      version: '1.0.0',
      skills: [
        { id: 'arithmetic', name: 'Basic Arithmetic', prerequisites: [] },
        { id: 'algebra', name: 'Algebra', prerequisites: ['arithmetic'] },
        { id: 'calculus', name: 'Calculus', prerequisites: ['algebra'] },
      ],
    };

    const graph = loadSkillGraphFromJSON(json);

    expect(graph.skills.size).toBe(3);
    expect(graph.skills.get('arithmetic')).toBeDefined();
    expect(graph.skills.get('algebra')).toBeDefined();
    expect(graph.skills.get('calculus')).toBeDefined();
  });

  it('should preserve optional fields', () => {
    const json: SkillGraphJSON = {
      version: '1.0.0',
      skills: [
        {
          id: 'skill1',
          name: 'Skill 1',
          prerequisites: [],
          description: 'A test skill',
          category: 'math',
          difficulty: 0.5,
        },
      ],
    };

    const graph = loadSkillGraphFromJSON(json);
    const skill = graph.skills.get('skill1');

    expect(skill).toBeDefined();
    expect(skill!.description).toBe('A test skill');
    expect(skill!.category).toBe('math');
    expect(skill!.difficulty).toBe(0.5);
  });

  it('should load empty graph', () => {
    const json: SkillGraphJSON = {
      version: '1.0.0',
      skills: [],
    };

    const graph = loadSkillGraphFromJSON(json);
    expect(graph.skills.size).toBe(0);
  });

  it('should validate graph structure', () => {
    const json: SkillGraphJSON = {
      version: '1.0.0',
      skills: [
        { id: 'a', name: 'A', prerequisites: [] },
        { id: 'b', name: 'B', prerequisites: ['a'] },
      ],
    };

    const graph = loadSkillGraphFromJSON(json);
    const result = graph.validate();

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// =============================================================================
// INVALID GRAPH REJECTION
// =============================================================================

describe('loadSkillGraphFromJSON - invalid graphs', () => {
  it('should throw on cycle', () => {
    const json: SkillGraphJSON = {
      version: '1.0.0',
      skills: [
        { id: 'a', name: 'A', prerequisites: ['b'] },
        { id: 'b', name: 'B', prerequisites: ['a'] },
      ],
    };

    expect(() => loadSkillGraphFromJSON(json)).toThrow(/Invalid skill graph/);
    expect(() => loadSkillGraphFromJSON(json)).toThrow(/[Cc]ycle/i);
  });

  it('should throw on self-reference cycle', () => {
    const json: SkillGraphJSON = {
      version: '1.0.0',
      skills: [
        { id: 'a', name: 'A', prerequisites: ['a'] },
      ],
    };

    expect(() => loadSkillGraphFromJSON(json)).toThrow(/Invalid skill graph/);
  });

  it('should throw on missing prerequisite', () => {
    const json: SkillGraphJSON = {
      version: '1.0.0',
      skills: [
        { id: 'a', name: 'A', prerequisites: ['nonexistent'] },
      ],
    };

    expect(() => loadSkillGraphFromJSON(json)).toThrow(/Invalid skill graph/);
    expect(() => loadSkillGraphFromJSON(json)).toThrow(/nonexistent/);
  });

  it('should throw on complex cycle', () => {
    const json: SkillGraphJSON = {
      version: '1.0.0',
      skills: [
        { id: 'a', name: 'A', prerequisites: [] },
        { id: 'b', name: 'B', prerequisites: ['a', 'c'] },
        { id: 'c', name: 'C', prerequisites: ['b'] }, // Creates cycle: b -> c -> b
      ],
    };

    expect(() => loadSkillGraphFromJSON(json)).toThrow(/Invalid skill graph/);
  });
});

// =============================================================================
// PARSE FROM STRING
// =============================================================================

describe('parseSkillGraph', () => {
  it('should parse valid JSON string', () => {
    const jsonString = JSON.stringify({
      version: '1.0.0',
      skills: [
        { id: 'a', name: 'A', prerequisites: [] },
        { id: 'b', name: 'B', prerequisites: ['a'] },
      ],
    });

    const graph = parseSkillGraph(jsonString);
    expect(graph.skills.size).toBe(2);
  });

  it('should throw on malformed JSON', () => {
    expect(() => parseSkillGraph('{ invalid json')).toThrow();
  });

  it('should throw on invalid graph in JSON string', () => {
    const jsonString = JSON.stringify({
      version: '1.0.0',
      skills: [
        { id: 'a', name: 'A', prerequisites: ['b'] },
        { id: 'b', name: 'B', prerequisites: ['a'] },
      ],
    });

    expect(() => parseSkillGraph(jsonString)).toThrow(/Invalid skill graph/);
  });
});

// =============================================================================
// EXPORT TO JSON
// =============================================================================

describe('exportSkillGraphToJSON', () => {
  it('should export graph to JSON format', () => {
    const graph = createSkillGraph();
    graph.addSkill({ id: 'a', name: 'A', prerequisites: [], description: 'desc', category: 'cat', difficulty: 0.3 });
    graph.addSkill({ id: 'b', name: 'B', prerequisites: ['a'] });

    const json = exportSkillGraphToJSON(graph);

    expect(json.version).toBe(SKILL_GRAPH_SCHEMA_VERSION);
    expect(json.skills).toHaveLength(2);

    const skillA = json.skills.find(s => s.id === 'a');
    expect(skillA).toBeDefined();
    expect(skillA!.name).toBe('A');
    expect(skillA!.description).toBe('desc');
    expect(skillA!.category).toBe('cat');
    expect(skillA!.difficulty).toBe(0.3);
  });

  it('should produce round-trippable JSON', () => {
    const original: SkillGraphJSON = {
      version: '1.0.0',
      skills: [
        { id: 'x', name: 'X', prerequisites: [] },
        { id: 'y', name: 'Y', prerequisites: ['x'], description: 'test' },
      ],
    };

    const graph = loadSkillGraphFromJSON(original);
    const exported = exportSkillGraphToJSON(graph);

    expect(exported.skills).toHaveLength(2);
    expect(exported.skills.find(s => s.id === 'x')).toBeDefined();
    expect(exported.skills.find(s => s.id === 'y')?.prerequisites).toEqual(['x']);
  });
});

// =============================================================================
// SCHEMA VERSION
// =============================================================================

describe('SKILL_GRAPH_SCHEMA_VERSION', () => {
  it('should be defined', () => {
    expect(SKILL_GRAPH_SCHEMA_VERSION).toBe('1.0.0');
  });
});
