/**
 * Fatigue Detection Module
 *
 * Rolling-window dual-threshold fatigue detector with hard session cap.
 * Ported from noesis-math; clock-injected for replay determinism.
 */

export {
  FatigueDetector,
  createFatigueDetector,
  DEFAULT_FATIGUE_CONFIG,
  type FatigueConfig,
  type FatigueSignal,
} from './FatigueDetector.js';
