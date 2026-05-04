import { describe, it, expect } from 'vitest';
import {
  validateEngineConfigOverrides,
  assertValidEngineConfigOverrides,
  type EngineConfigOverrides,
} from '../config/index.js';

describe('EngineConfigOverrides', () => {
  describe('empty / no-op', () => {
    it('accepts an empty overrides object', () => {
      expect(validateEngineConfigOverrides({})).toEqual([]);
    });

    it('accepts an undefined-everything overrides object', () => {
      const overrides: EngineConfigOverrides = {
        bktDefaults: undefined,
        bktChannels: undefined,
        fsrs: undefined,
        session: undefined,
        responseTimeThresholdsMs: undefined,
      };
      expect(validateEngineConfigOverrides(overrides)).toEqual([]);
    });
  });

  describe('bktDefaults', () => {
    it('accepts a valid partial BKT override', () => {
      expect(
        validateEngineConfigOverrides({
          bktDefaults: { pInit: 0.5, pLearn: 0.2 },
        })
      ).toEqual([]);
    });

    it('rejects pSlip = 0 (would cause division-by-zero)', () => {
      const errors = validateEngineConfigOverrides({
        bktDefaults: { pSlip: 0 },
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].path).toBe('bktDefaults');
      expect(errors[0].message).toMatch(/pSlip/);
    });

    it('rejects pSlip + pGuess >= 1 (model identifiability)', () => {
      const errors = validateEngineConfigOverrides({
        bktDefaults: { pSlip: 0.6, pGuess: 0.5 },
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].path).toBe('bktDefaults');
      expect(errors[0].message).toMatch(/identifiability/);
    });
  });

  describe('bktChannels', () => {
    it('accepts a valid multi-channel override', () => {
      const overrides: EngineConfigOverrides = {
        bktChannels: {
          recog_mc: { pInit: 0.12, pGuess: 0.25 },
          cloze: { pInit: 0.1, pGuess: 0.15 },
          prod_typed: { pInit: 0.08, pGuess: 0.08 },
        },
      };
      expect(validateEngineConfigOverrides(overrides)).toEqual([]);
    });

    it('reports per-channel errors with the channel id in the path', () => {
      const overrides: EngineConfigOverrides = {
        bktChannels: {
          recog_mc: { pInit: 0.12 },
          cloze: { pSlip: 0 },
          prod_typed: { pSlip: 0.7, pGuess: 0.5 },
        },
      };
      const errors = validateEngineConfigOverrides(overrides);
      const paths = errors.map((e) => e.path).sort();
      expect(paths).toEqual(['bktChannels.cloze', 'bktChannels.prod_typed']);
    });
  });

  describe('fsrs', () => {
    it('rejects requestedRetention <= 0 or >= 1', () => {
      expect(
        validateEngineConfigOverrides({ fsrs: { requestedRetention: 0 } })
      ).toHaveLength(1);
      expect(
        validateEngineConfigOverrides({ fsrs: { requestedRetention: 1 } })
      ).toHaveLength(1);
      expect(
        validateEngineConfigOverrides({ fsrs: { requestedRetention: 0.85 } })
      ).toHaveLength(0);
    });

    it('rejects non-positive maxInterval', () => {
      expect(validateEngineConfigOverrides({ fsrs: { maxInterval: 0 } })).toHaveLength(1);
      expect(validateEngineConfigOverrides({ fsrs: { maxInterval: -1 } })).toHaveLength(1);
      expect(validateEngineConfigOverrides({ fsrs: { maxInterval: 180 } })).toHaveLength(0);
    });

    it('rejects initialDifficulty out of [0,1]', () => {
      expect(
        validateEngineConfigOverrides({ fsrs: { initialDifficulty: 1.5 } })
      ).toHaveLength(1);
      expect(
        validateEngineConfigOverrides({ fsrs: { initialDifficulty: -0.1 } })
      ).toHaveLength(1);
      expect(
        validateEngineConfigOverrides({ fsrs: { initialDifficulty: 0.55 } })
      ).toHaveLength(0);
    });
  });

  describe('session', () => {
    it('accepts pack-tuned session budgets (eng=18, math=20, delf=15)', () => {
      expect(
        validateEngineConfigOverrides({ session: { targetItems: 18 } })
      ).toEqual([]);
      expect(
        validateEngineConfigOverrides({ session: { targetItems: 20 } })
      ).toEqual([]);
      expect(
        validateEngineConfigOverrides({ session: { targetItems: 15 } })
      ).toEqual([]);
    });

    it('rejects masteryThreshold out of [0,1]', () => {
      expect(
        validateEngineConfigOverrides({ session: { masteryThreshold: 1.5 } })
      ).toHaveLength(1);
      expect(
        validateEngineConfigOverrides({ session: { masteryThreshold: -0.1 } })
      ).toHaveLength(1);
    });

    it('rejects non-positive targetItems', () => {
      expect(validateEngineConfigOverrides({ session: { targetItems: 0 } })).toHaveLength(1);
      expect(validateEngineConfigOverrides({ session: { targetItems: -3 } })).toHaveLength(1);
    });
  });

  describe('responseTimeThresholdsMs', () => {
    it('accepts the noesis-eng per-channel thresholds', () => {
      expect(
        validateEngineConfigOverrides({
          responseTimeThresholdsMs: {
            recog_mc: 4500,
            cloze: 7000,
            prod_typed: 9000,
          },
        })
      ).toEqual([]);
    });

    it('rejects non-positive or non-finite thresholds', () => {
      const errors = validateEngineConfigOverrides({
        responseTimeThresholdsMs: {
          a: 0,
          b: -1,
          c: NaN,
          d: Infinity,
          e: 5000,
        },
      });
      const paths = errors.map((e) => e.path).sort();
      expect(paths).toEqual([
        'responseTimeThresholdsMs.a',
        'responseTimeThresholdsMs.b',
        'responseTimeThresholdsMs.c',
        'responseTimeThresholdsMs.d',
      ]);
    });
  });

  describe('assertValidEngineConfigOverrides', () => {
    it('throws with a multi-line summary when invalid', () => {
      expect(() =>
        assertValidEngineConfigOverrides({
          bktDefaults: { pSlip: 0 },
          session: { targetItems: -1 },
        })
      ).toThrow(/bktDefaults.*session\.targetItems/s);
    });

    it('does not throw when valid', () => {
      expect(() =>
        assertValidEngineConfigOverrides({
          bktDefaults: { pInit: 0.4 },
          session: { targetItems: 18 },
        })
      ).not.toThrow();
    });
  });

  describe('forward-compatible reserved fields', () => {
    it('accepts unknown layeredMastery / budgetedPlanner / fatigue / calibrator values', () => {
      const overrides: EngineConfigOverrides = {
        layeredMastery: { someFutureField: 'x' },
        budgetedPlanner: 42,
        fatigue: null,
        calibrator: { K_LEARNER: 32 },
      };
      expect(validateEngineConfigOverrides(overrides)).toEqual([]);
    });
  });
});
