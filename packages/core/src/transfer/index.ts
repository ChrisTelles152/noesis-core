/**
 * Transfer Testing Module
 *
 * Provides near/far transfer test specification and gating logic.
 */

export type {
  TransferTest,
  TransferTestResult,
  TransferGate,
} from '../constitution';

// TODO: Implement TransferGate
// export { createTransferGate } from './TransferGateImpl';

/**
 * Placeholder: Create a transfer gate
 */
export function createTransferGate(): import('../constitution').TransferGate {
  throw new Error('Not implemented: createTransferGate - see packages/core/src/transfer for TODOs');
}
