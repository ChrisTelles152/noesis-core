/**
 * Transfer Gate Tests
 *
 * Tests for near/far transfer gating and skill unlock logic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TransferGateImpl,
  createTransferGate,
  DEFAULT_TRANSFER_GATE_CONFIG,
} from '../transfer/TransferGateImpl.js';
import type { TransferTest, TransferTestResult } from '../constitution.js';

// Helper to create transfer tests
function createTest(
  id: string,
  skillId: string,
  transferType: 'near' | 'far',
  passingScore = 0.7
): TransferTest {
  return {
    id,
    skillId,
    transferType,
    context: `Test context for ${id}`,
    passingScore,
  };
}

// Helper to create test results
function createResult(
  testId: string,
  passed: boolean,
  score: number,
  timestamp = Date.now()
): TransferTestResult {
  return { testId, passed, score, timestamp };
}

describe('TransferGateImpl', () => {
  let gate: TransferGateImpl;

  beforeEach(() => {
    gate = createTransferGate();
  });

  describe('default configuration', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_TRANSFER_GATE_CONFIG.requireNearTransfer).toBe(true);
      expect(DEFAULT_TRANSFER_GATE_CONFIG.requireFarTransfer).toBe(false);
      expect(DEFAULT_TRANSFER_GATE_CONFIG.gracePeriodEvents).toBe(3);
    });
  });

  describe('isSkillUnlocked', () => {
    it('should return true when no tests are defined for skill', () => {
      const tests: TransferTest[] = [];
      const results: TransferTestResult[] = [];

      expect(gate.isSkillUnlocked('skillA', results, tests)).toBe(true);
    });

    it('should return true when near transfer test is passed', () => {
      const tests = [createTest('near-A', 'skillA', 'near')];
      const results = [createResult('near-A', true, 0.8)];

      expect(gate.isSkillUnlocked('skillA', results, tests)).toBe(true);
    });

    it('should return false when near transfer test is not passed', () => {
      const tests = [createTest('near-A', 'skillA', 'near')];
      const results = [createResult('near-A', false, 0.5)];

      expect(gate.isSkillUnlocked('skillA', results, tests)).toBe(false);
    });

    it('should return false when near transfer test has no results', () => {
      const tests = [createTest('near-A', 'skillA', 'near')];
      const results: TransferTestResult[] = [];

      expect(gate.isSkillUnlocked('skillA', results, tests)).toBe(false);
    });

    it('should ignore far transfer tests by default', () => {
      const tests = [
        createTest('near-A', 'skillA', 'near'),
        createTest('far-A', 'skillA', 'far'),
      ];
      const results = [createResult('near-A', true, 0.8)];

      // Only near transfer required by default
      expect(gate.isSkillUnlocked('skillA', results, tests)).toBe(true);
    });

    it('should check both near and far when configured', () => {
      const gateWithFar = createTransferGate({
        requireNearTransfer: true,
        requireFarTransfer: true,
      });

      const tests = [
        createTest('near-A', 'skillA', 'near'),
        createTest('far-A', 'skillA', 'far'),
      ];

      // Only near passed
      const nearOnly = [createResult('near-A', true, 0.8)];
      expect(gateWithFar.isSkillUnlocked('skillA', nearOnly, tests)).toBe(false);

      // Both passed
      const bothPassed = [
        createResult('near-A', true, 0.8),
        createResult('far-A', true, 0.75),
      ];
      expect(gateWithFar.isSkillUnlocked('skillA', bothPassed, tests)).toBe(true);
    });

    it('should handle multiple skills independently', () => {
      const tests = [
        createTest('near-A', 'skillA', 'near'),
        createTest('near-B', 'skillB', 'near'),
      ];
      const results = [createResult('near-A', true, 0.8)];

      expect(gate.isSkillUnlocked('skillA', results, tests)).toBe(true);
      expect(gate.isSkillUnlocked('skillB', results, tests)).toBe(false);
    });
  });

  describe('getRequiredTests', () => {
    it('should return only near tests by default', () => {
      const tests = [
        createTest('near-A', 'skillA', 'near'),
        createTest('far-A', 'skillA', 'far'),
      ];

      const required = gate.getRequiredTests('skillA', tests);

      expect(required.length).toBe(1);
      expect(required[0].transferType).toBe('near');
    });

    it('should return both near and far when configured', () => {
      const gateWithFar = createTransferGate({
        requireNearTransfer: true,
        requireFarTransfer: true,
      });

      const tests = [
        createTest('near-A', 'skillA', 'near'),
        createTest('far-A', 'skillA', 'far'),
      ];

      const required = gateWithFar.getRequiredTests('skillA', tests);

      expect(required.length).toBe(2);
      expect(required.some(t => t.transferType === 'near')).toBe(true);
      expect(required.some(t => t.transferType === 'far')).toBe(true);
    });

    it('should return empty array when no tests for skill', () => {
      const tests = [createTest('near-B', 'skillB', 'near')];

      const required = gate.getRequiredTests('skillA', tests);

      expect(required).toEqual([]);
    });

    it('should be deterministic with multiple tests', () => {
      const tests = [
        createTest('near-A2', 'skillA', 'near'),
        createTest('near-A1', 'skillA', 'near'),
        createTest('near-A3', 'skillA', 'near'),
      ];

      const required1 = gate.getRequiredTests('skillA', tests);
      const required2 = gate.getRequiredTests('skillA', tests);

      expect(required1).toEqual(required2);
      // Should select alphabetically first one
      expect(required1[0].id).toBe('near-A1');
    });
  });

  describe('getPendingTests', () => {
    it('should return all required tests when none passed', () => {
      const tests = [createTest('near-A', 'skillA', 'near')];
      const results: TransferTestResult[] = [];

      const pending = gate.getPendingTests('skillA', results, tests);

      expect(pending.length).toBe(1);
      expect(pending[0].id).toBe('near-A');
    });

    it('should return empty array when all required tests passed', () => {
      const tests = [createTest('near-A', 'skillA', 'near')];
      const results = [createResult('near-A', true, 0.8)];

      const pending = gate.getPendingTests('skillA', results, tests);

      expect(pending).toEqual([]);
    });

    it('should not count failed attempts as passed', () => {
      const tests = [createTest('near-A', 'skillA', 'near')];
      const results = [createResult('near-A', false, 0.5)];

      const pending = gate.getPendingTests('skillA', results, tests);

      expect(pending.length).toBe(1);
    });

    it('should track near and far separately', () => {
      const gateWithFar = createTransferGate({
        requireNearTransfer: true,
        requireFarTransfer: true,
      });

      const tests = [
        createTest('near-A', 'skillA', 'near'),
        createTest('far-A', 'skillA', 'far'),
      ];
      const results = [createResult('near-A', true, 0.8)];

      const pending = gateWithFar.getPendingTests('skillA', results, tests);

      expect(pending.length).toBe(1);
      expect(pending[0].transferType).toBe('far');
    });
  });

  describe('getNextTest', () => {
    it('should prioritize near transfer over far transfer', () => {
      const gateWithFar = createTransferGate({
        requireNearTransfer: true,
        requireFarTransfer: true,
      });

      const tests = [
        createTest('far-A', 'skillA', 'far'),
        createTest('near-A', 'skillA', 'near'),
      ];
      const results: TransferTestResult[] = [];

      const next = gateWithFar.getNextTest('skillA', results, tests);

      expect(next?.transferType).toBe('near');
    });

    it('should return far transfer after near is passed', () => {
      const gateWithFar = createTransferGate({
        requireNearTransfer: true,
        requireFarTransfer: true,
      });

      const tests = [
        createTest('near-A', 'skillA', 'near'),
        createTest('far-A', 'skillA', 'far'),
      ];
      const results = [createResult('near-A', true, 0.8)];

      const next = gateWithFar.getNextTest('skillA', results, tests);

      expect(next?.transferType).toBe('far');
    });

    it('should return undefined when all tests passed', () => {
      const tests = [createTest('near-A', 'skillA', 'near')];
      const results = [createResult('near-A', true, 0.8)];

      const next = gate.getNextTest('skillA', results, tests);

      expect(next).toBeUndefined();
    });

    it('should return undefined when no tests for skill', () => {
      const tests: TransferTest[] = [];
      const results: TransferTestResult[] = [];

      const next = gate.getNextTest('skillA', results, tests);

      expect(next).toBeUndefined();
    });
  });

  describe('evaluateAttempt', () => {
    it('should mark test as passed when score meets passing threshold', () => {
      const test = createTest('near-A', 'skillA', 'near', 0.7);
      const timestamp = Date.now();

      const result = gate.evaluateAttempt(test, 0.7, timestamp);

      expect(result.passed).toBe(true);
      expect(result.score).toBe(0.7);
      expect(result.testId).toBe('near-A');
      expect(result.timestamp).toBe(timestamp);
    });

    it('should mark test as failed when score below passing threshold', () => {
      const test = createTest('near-A', 'skillA', 'near', 0.7);
      const timestamp = Date.now();

      const result = gate.evaluateAttempt(test, 0.69, timestamp);

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0.69);
    });

    it('should respect custom passing scores', () => {
      const easyTest = createTest('easy', 'skillA', 'near', 0.5);
      const hardTest = createTest('hard', 'skillA', 'far', 0.9);
      const timestamp = Date.now();

      expect(gate.evaluateAttempt(easyTest, 0.6, timestamp).passed).toBe(true);
      expect(gate.evaluateAttempt(hardTest, 0.8, timestamp).passed).toBe(false);
    });
  });

  describe('getTransferStatus', () => {
    it('should return status for multiple skills', () => {
      const tests = [
        createTest('near-A', 'skillA', 'near'),
        createTest('near-B', 'skillB', 'near'),
      ];
      const results = [createResult('near-A', true, 0.8)];

      const status = gate.getTransferStatus(results, tests, ['skillA', 'skillB']);

      expect(status.get('skillA')?.isUnlocked).toBe(true);
      expect(status.get('skillB')?.isUnlocked).toBe(false);
    });

    it('should count required and passed tests correctly', () => {
      const gateWithFar = createTransferGate({
        requireNearTransfer: true,
        requireFarTransfer: true,
      });

      const tests = [
        createTest('near-A', 'skillA', 'near'),
        createTest('far-A', 'skillA', 'far'),
      ];
      const results = [createResult('near-A', true, 0.8)];

      const status = gateWithFar.getTransferStatus(results, tests, ['skillA']);
      const skillStatus = status.get('skillA')!;

      expect(skillStatus.requiredTests).toBe(2);
      expect(skillStatus.passedTests).toBe(1);
      expect(skillStatus.pendingTests).toBe(1);
    });

    it('should track attempt count', () => {
      const tests = [createTest('near-A', 'skillA', 'near')];
      const results = [
        createResult('near-A', false, 0.5, 1000),
        createResult('near-A', false, 0.6, 2000),
        createResult('near-A', true, 0.8, 3000),
      ];

      const status = gate.getTransferStatus(results, tests, ['skillA']);

      expect(status.get('skillA')?.attempts).toBe(3);
      expect(status.get('skillA')?.lastAttempt).toBe(3000);
    });

    it('should handle skills with no tests', () => {
      const tests: TransferTest[] = [];
      const results: TransferTestResult[] = [];

      const status = gate.getTransferStatus(results, tests, ['skillA']);
      const skillStatus = status.get('skillA')!;

      expect(skillStatus.isUnlocked).toBe(true);
      expect(skillStatus.requiredTests).toBe(0);
      expect(skillStatus.passedTests).toBe(0);
      expect(skillStatus.pendingTests).toBe(0);
    });
  });

  describe('createTest helper', () => {
    it('should create a test with default passing score', () => {
      const test = gate.createTest('test-1', 'skillA', 'near', 'Test context');

      expect(test.id).toBe('test-1');
      expect(test.skillId).toBe('skillA');
      expect(test.transferType).toBe('near');
      expect(test.context).toBe('Test context');
      expect(test.passingScore).toBe(0.7);
    });

    it('should create a test with custom passing score', () => {
      const test = gate.createTest('test-1', 'skillA', 'far', 'Hard context', 0.9);

      expect(test.passingScore).toBe(0.9);
    });
  });

  describe('near to far transition progression', () => {
    it('should enforce progression from near to far', () => {
      const gateWithFar = createTransferGate({
        requireNearTransfer: true,
        requireFarTransfer: true,
      });

      const tests = [
        createTest('near-A', 'skillA', 'near'),
        createTest('far-A', 'skillA', 'far'),
      ];

      // Step 1: No tests completed
      let results: TransferTestResult[] = [];
      expect(gateWithFar.isSkillUnlocked('skillA', results, tests)).toBe(false);
      expect(gateWithFar.getNextTest('skillA', results, tests)?.transferType).toBe('near');

      // Step 2: Near test passed
      results = [createResult('near-A', true, 0.8)];
      expect(gateWithFar.isSkillUnlocked('skillA', results, tests)).toBe(false);
      expect(gateWithFar.getNextTest('skillA', results, tests)?.transferType).toBe('far');

      // Step 3: Far test passed
      results = [
        createResult('near-A', true, 0.8),
        createResult('far-A', true, 0.75),
      ];
      expect(gateWithFar.isSkillUnlocked('skillA', results, tests)).toBe(true);
      expect(gateWithFar.getNextTest('skillA', results, tests)).toBeUndefined();
    });

    it('should allow far-only configuration', () => {
      const farOnlyGate = createTransferGate({
        requireNearTransfer: false,
        requireFarTransfer: true,
      });

      const tests = [
        createTest('near-A', 'skillA', 'near'),
        createTest('far-A', 'skillA', 'far'),
      ];

      const results = [createResult('far-A', true, 0.8)];

      expect(farOnlyGate.isSkillUnlocked('skillA', results, tests)).toBe(true);
    });

    it('should allow no-transfer configuration', () => {
      const noTransferGate = createTransferGate({
        requireNearTransfer: false,
        requireFarTransfer: false,
      });

      const tests = [
        createTest('near-A', 'skillA', 'near'),
        createTest('far-A', 'skillA', 'far'),
      ];

      const results: TransferTestResult[] = [];

      expect(noTransferGate.isSkillUnlocked('skillA', results, tests)).toBe(true);
    });
  });

  describe('determinism', () => {
    it('should produce identical results for same inputs', () => {
      const tests = [
        createTest('near-A2', 'skillA', 'near'),
        createTest('near-A1', 'skillA', 'near'),
        createTest('far-A', 'skillA', 'far'),
      ];
      const _results = [createResult('near-A1', true, 0.8)];

      const required1 = gate.getRequiredTests('skillA', tests);
      const required2 = gate.getRequiredTests('skillA', tests);

      expect(required1).toEqual(required2);
    });

    it('should handle test ID ordering deterministically', () => {
      const tests1 = [
        createTest('test-z', 'skillA', 'near'),
        createTest('test-a', 'skillA', 'near'),
      ];
      const tests2 = [
        createTest('test-a', 'skillA', 'near'),
        createTest('test-z', 'skillA', 'near'),
      ];

      // Both should select 'test-a' as the first required test
      expect(gate.getRequiredTests('skillA', tests1)[0].id).toBe('test-a');
      expect(gate.getRequiredTests('skillA', tests2)[0].id).toBe('test-a');
    });
  });
});
