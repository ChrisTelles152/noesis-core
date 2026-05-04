/**
 * Item History Module
 *
 * Pure in-memory item-attempt aggregation. Counts attempts, accuracy,
 * weak-item flagging, mastery flag. Persistence is the app's responsibility
 * via NoesisStateStore.
 */

export {
  ItemHistoryAggregator,
  createItemHistoryAggregator,
  DEFAULT_ITEM_HISTORY_CONFIG,
  type ItemAttempt,
  type ItemHistoryConfig,
  type ItemMasteryInfo,
} from './ItemHistoryAggregator.js';
