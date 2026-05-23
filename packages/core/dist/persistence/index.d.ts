/**
 * Persistence Adapter Module
 *
 * Provides interfaces and implementations for persisting engine state.
 * The core SDK remains dependency-free - adapters for specific storage
 * backends (localStorage, IndexedDB, PostgreSQL, etc.) should be
 * implemented by the consuming application.
 */
/**
 * Interface for persisting Noesis engine state.
 * Implementations can use any storage backend (memory, localStorage, DB, etc.)
 */
export interface NoesisStateStore {
    /**
     * Load state for a learner.
     * @param learnerId - The learner identifier
     * @returns JSON string from engine.exportState(), or null if not found
     */
    load(learnerId: string): Promise<string | null>;
    /**
     * Save state for a learner.
     * @param learnerId - The learner identifier
     * @param state - JSON string from engine.exportState()
     */
    save(learnerId: string, state: string): Promise<void>;
}
/**
 * Optimistic-lock-aware persistence. Used wherever silent overwrites are
 * unacceptable (BKT state, FSRS state, session state).
 */
export { OptimisticLockConflictError, InMemoryOptimisticStore, createInMemoryOptimisticStore, updateWithRetry, type OptimisticLockingStore, type VersionedValue, type UpdateWithRetryOptions, } from './OptimisticLockingStateStore.js';
/**
 * In-memory state store for testing and development.
 * State is lost when the process exits.
 */
export declare class InMemoryStateStore implements NoesisStateStore {
    private store;
    load(learnerId: string): Promise<string | null>;
    save(learnerId: string, state: string): Promise<void>;
    /**
     * Clear all stored state (useful for testing)
     */
    clear(): void;
    /**
     * Check if state exists for a learner
     */
    has(learnerId: string): boolean;
    /**
     * Get all stored learner IDs
     */
    keys(): string[];
}
//# sourceMappingURL=index.d.ts.map