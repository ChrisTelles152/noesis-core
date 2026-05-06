/**
 * Path status helper tests (Phase H4)
 *
 * The gating logic is the spine of the path UI: a single off-by-one in
 * the threshold check ripples into every locked card. Pinning behaviour
 * here separates "is the rule correct" from "does the page render right."
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadContentPack } from '@noesis/content-pt-br-math';
import {
  computePathStatus,
  getMissingPrerequisites,
  loadEstimatesFromStorage,
  MASTERY_THRESHOLD,
  IN_PROGRESS_THRESHOLD,
} from '../pathStatus';

const pack = loadContentPack();
const adicao = pack.skillGraph.skills.get('adicao')!;
const subtracao = pack.skillGraph.skills.get('subtracao')!;
const equacoesQuadraticas = pack.skillGraph.skills.get('equacoes_quadraticas')!;

describe('computePathStatus', () => {
  it('returns "available" for a no-prereq skill with default prior', () => {
    const estimates = new Map<string, number>();
    expect(computePathStatus(adicao, estimates, pack.skillGraph)).toBe('available');
  });

  it('returns "mastered" when own estimate >= MASTERY_THRESHOLD', () => {
    const estimates = new Map([['adicao', MASTERY_THRESHOLD]]);
    expect(computePathStatus(adicao, estimates, pack.skillGraph)).toBe('mastered');
  });

  it('returns "inProgress" when own estimate is between IN_PROGRESS and MASTERY thresholds', () => {
    const estimates = new Map([['adicao', IN_PROGRESS_THRESHOLD + 0.1]]);
    expect(computePathStatus(adicao, estimates, pack.skillGraph)).toBe('inProgress');
  });

  it('returns "locked" when any prerequisite is below mastery threshold', () => {
    const estimates = new Map([['adicao', 0.1]]);
    // subtracao depends on adicao
    expect(computePathStatus(subtracao, estimates, pack.skillGraph)).toBe('locked');
  });

  it('opens the gate as soon as every prereq crosses MASTERY_THRESHOLD', () => {
    const estimates = new Map([['adicao', MASTERY_THRESHOLD]]);
    expect(computePathStatus(subtracao, estimates, pack.skillGraph)).toBe('available');
  });

  it('treats missing-from-map estimates as the default prior (0.3)', () => {
    // equacoes_quadraticas depends on polinomios + equacoes_lineares — both
    // unset means "use prior 0.3", which is below MASTERY_THRESHOLD, so the
    // node should be locked.
    expect(computePathStatus(equacoesQuadraticas, new Map(), pack.skillGraph)).toBe('locked');
  });

  it('locked beats high-own-estimate (prereq gate is authoritative)', () => {
    // Even if equacoes_quadraticas itself were "mastered", a missing prereq
    // should still lock the UI — otherwise the prereq trail breaks.
    const estimates = new Map([['equacoes_quadraticas', 0.95]]);
    expect(computePathStatus(equacoesQuadraticas, estimates, pack.skillGraph)).toBe('locked');
  });
});

describe('getMissingPrerequisites', () => {
  it('returns the prereqs that are still below threshold', () => {
    const estimates = new Map([
      ['polinomios', 0.95], // mastered
      ['equacoes_lineares', 0.4], // not mastered
    ]);
    const missing = getMissingPrerequisites(equacoesQuadraticas, estimates, pack.skillGraph);
    expect(missing.map((s) => s.id)).toEqual(['equacoes_lineares']);
  });

  it('returns an empty list when all prereqs are mastered', () => {
    const estimates = new Map([
      ['polinomios', 0.95],
      ['equacoes_lineares', 0.95],
    ]);
    expect(getMissingPrerequisites(equacoesQuadraticas, estimates, pack.skillGraph)).toEqual([]);
  });
});

describe('loadEstimatesFromStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty map when no key is set', () => {
    expect(loadEstimatesFromStorage('noesis-test-key').size).toBe(0);
  });

  it('parses a valid object payload into a Map', () => {
    localStorage.setItem('noesis-test-key', JSON.stringify({ adicao: 0.8, subtracao: 0.5 }));
    const map = loadEstimatesFromStorage('noesis-test-key');
    expect(map.get('adicao')).toBe(0.8);
    expect(map.get('subtracao')).toBe(0.5);
  });

  it('drops non-numeric values silently rather than crashing the Path page', () => {
    localStorage.setItem(
      'noesis-test-key',
      JSON.stringify({ adicao: 0.8, garbage: 'not-a-number', missing: null })
    );
    const map = loadEstimatesFromStorage('noesis-test-key');
    expect(map.get('adicao')).toBe(0.8);
    expect(map.has('garbage')).toBe(false);
    expect(map.has('missing')).toBe(false);
  });

  it('returns empty when JSON is malformed (no throw — UI keeps rendering)', () => {
    localStorage.setItem('noesis-test-key', 'not-json{{{');
    expect(loadEstimatesFromStorage('noesis-test-key').size).toBe(0);
  });
});
