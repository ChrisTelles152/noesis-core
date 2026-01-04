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

export {
  TransferGateImpl,
  createTransferGate,
  DEFAULT_TRANSFER_GATE_CONFIG,
  type TransferGateConfig,
  type TransferStatus,
} from './TransferGateImpl';
