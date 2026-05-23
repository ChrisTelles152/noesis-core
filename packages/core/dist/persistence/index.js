/**
 * Persistence Adapter Module
 *
 * Provides interfaces and implementations for persisting engine state.
 * The core SDK remains dependency-free - adapters for specific storage
 * backends (localStorage, IndexedDB, PostgreSQL, etc.) should be
 * implemented by the consuming application.
 */
/**
 * Optimistic-lock-aware persistence. Used wherever silent overwrites are
 * unacceptable (BKT state, FSRS state, session state).
 */
export { OptimisticLockConflictError, InMemoryOptimisticStore, createInMemoryOptimisticStore, updateWithRetry, } from './OptimisticLockingStateStore.js';
/**
 * In-memory state store for testing and development.
 * State is lost when the process exits.
 */
export class InMemoryStateStore {
    store = new Map();
    async load(learnerId) {
        return this.store.get(learnerId) ?? null;
    }
    async save(learnerId, state) {
        this.store.set(learnerId, state);
    }
    /**
     * Clear all stored state (useful for testing)
     */
    clear() {
        this.store.clear();
    }
    /**
     * Check if state exists for a learner
     */
    has(learnerId) {
        return this.store.has(learnerId);
    }
    /**
     * Get all stored learner IDs
     */
    keys() {
        return Array.from(this.store.keys());
    }
}
//# sourceMappingURL=index.js.map